import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { validatePlacements } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';

const EPS = 1e-9;
const cbm = (item: CargoItem) => item.length * item.width * item.height;
const fitCount = (available: number, size: number) => size > 0 ? Math.floor((available + EPS) / size) : 0;
const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean };

type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

type StackOrientation = {
  length: number;
  width: number;
  rotated: boolean;
  layersHigh: number;
  capacity: number;
};

type PureShelf = {
  x: number;
  usedY: number;
  depth: number;
};

function browserStrategy(): LoadingStrategy {
  if (typeof window === 'undefined') return 'capacity';
  const value = window.localStorage?.getItem(LOADING_STRATEGY_STORAGE_KEY);
  return value === 'stability' || value === 'unloading' ? value : 'capacity';
}

function publishCorrections(corrections: AutoCorrectionRecord[]) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  (window as CorrectionWindow).__containerLoadingAutoCorrections = corrections;
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const detail = { container, cargo, result };
  (window as CorrectionWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

function capacityScore(item: CargoItem) {
  return cbm(item) * item.quantity + item.weightKg * 0.001;
}

function totalCbm(item: CargoItem) {
  return cbm(item) * item.quantity;
}

function totalWeight(item: CargoItem) {
  return item.weightKg * item.quantity;
}

function prioritizedCargo(cargo: CargoItem[], strategy: LoadingStrategy): CargoItem[] {
  return [...cargo].sort((a, b) => {
    const cbmDiff = totalCbm(b) - totalCbm(a);
    if (Math.abs(cbmDiff) > EPS) return cbmDiff;
    const totalWeightDiff = totalWeight(b) - totalWeight(a);
    if (Math.abs(totalWeightDiff) > EPS) return totalWeightDiff;
    const unitWeightDiff = b.weightKg - a.weightKg;
    if (Math.abs(unitWeightDiff) > EPS) return unitWeightDiff;
    if (strategy === 'stability') {
      const footprintDiff = b.length * b.width - a.length * a.width;
      if (Math.abs(footprintDiff) > EPS) return footprintDiff;
      const capacityDiff = capacityScore(b) - capacityScore(a);
      if (Math.abs(capacityDiff) > EPS) return capacityDiff;
      return a.id.localeCompare(b.id);
    }
    if (strategy === 'unloading') {
      const unloadDiff = (b.unloadPriority ?? 0) - (a.unloadPriority ?? 0);
      if (unloadDiff !== 0) return unloadDiff;
      const capacityDiff = capacityScore(b) - capacityScore(a);
      if (Math.abs(capacityDiff) > EPS) return capacityDiff;
      return a.id.localeCompare(b.id);
    }
    const capacityDiff = capacityScore(b) - capacityScore(a);
    if (Math.abs(capacityDiff) > EPS) return capacityDiff;
    return a.id.localeCompare(b.id);
  });
}

function safeIdenticalStackLayers(item: CargoItem) {
  const stackLimit = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
  if (item.maxTopLoadKg === undefined) return stackLimit;
  const byTopLoad = 1 + Math.floor((Math.max(0, item.maxTopLoadKg) + EPS) / Math.max(item.weightKg, EPS));
  return Math.max(1, Math.min(stackLimit, byTopLoad));
}

function stackOrientations(container: ContainerSpec, item: CargoItem): StackOrientation[] {
  const layersHigh = Math.min(safeIdenticalStackLayers(item), fitCount(container.height, item.height));
  if (layersHigh < 1) return [];
  const options = [
    { length: item.length, width: item.width, rotated: false },
    ...(item.allowRotation === false || Math.abs(item.length - item.width) < EPS
      ? []
      : [{ length: item.width, width: item.length, rotated: true }]),
  ];
  return options
    .filter((option) => option.length <= container.length + EPS && option.width <= container.width + EPS)
    .map((option) => ({
      ...option,
      layersHigh,
      capacity: fitCount(container.length, option.length) * fitCount(container.width, option.width) * layersHigh,
    }))
    .sort((a, b) => b.capacity - a.capacity || a.width - b.width || a.length - b.length);
}

function buildVerticalStack(
  item: CargoItem,
  x: number,
  y: number,
  orientation: StackOrientation,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
) {
  const stack: Placement[] = [];
  for (let layer = 0; layer < orientation.layersHigh; layer += 1) {
    const candidate: Placement = {
      cargoId: item.id,
      x,
      y,
      z: layer * item.height,
      length: orientation.length,
      width: orientation.width,
      height: item.height,
      weightKg: item.weightKg,
      rotated: orientation.rotated,
    };
    if (!canPlaceByStackingRules(item, candidate, [...placements, ...stack], cargoById)) return null;
    stack.push(candidate);
  }
  return stack;
}

function nextShelf(shelf: PureShelf): PureShelf {
  return { x: shelf.x + shelf.depth, usedY: 0, depth: 0 };
}

function shelfCanFit(container: ContainerSpec, shelf: PureShelf, orientation: StackOrientation) {
  const nextDepth = Math.max(shelf.depth, orientation.length);
  return shelf.usedY + orientation.width <= container.width + EPS
    && shelf.x + nextDepth <= container.length + EPS;
}

function chooseShelfOrientation(container: ContainerSpec, shelf: PureShelf, options: StackOrientation[]) {
  return options
    .filter((orientation) => shelfCanFit(container, shelf, orientation))
    .sort((a, b) => {
      const remainingA = container.width - (shelf.usedY + a.width);
      const remainingB = container.width - (shelf.usedY + b.width);
      // 이미 열린 선반에서는 남은 폭을 가장 적게 만드는 방향을 우선한다.
      if (shelf.usedY > EPS && Math.abs(remainingA - remainingB) > EPS) return remainingA - remainingB;
      return b.capacity - a.capacity || a.length - b.length;
    })[0];
}

function furthestTail(placements: Placement[]) {
  return placements.reduce((tail, placement) => Math.max(tail, placement.x + placement.length), 0);
}

export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const strategy = options.strategy ?? browserStrategy();
  const shouldPublish = options.publish !== false;
  const preflight = preflightCargoInput(cargo);
  const normalizedCargo = preflight.cargo;
  const invalidContainer = containerInputError(container);

  if (invalidContainer) {
    const result: LoadingResult = {
      placements: [],
      remaining: [
        ...preflight.rejected,
        ...normalizedCargo.map((item) => ({ cargoId: item.id, quantity: item.quantity, reason: invalidContainer })),
      ],
      loadedWeightKg: 0,
      usedVolumeM3: 0,
      validationIssues: [],
      autoCorrections: [],
    };
    if (shouldPublish) {
      publishCorrections([]);
      publishLoadingResult(container, normalizedCargo, result);
    }
    return result;
  }

  if (preflight.rejected.length === 0 && shouldPublish && options.strategy === undefined) {
    const manual = readManualOverride(container, normalizedCargo);
    if (manual) {
      publishCorrections(manual.autoCorrections ?? []);
      publishLoadingResult(container, normalizedCargo, manual);
      return manual;
    }
  }

  const placements: Placement[] = [];
  const deferred: Array<{ item: CargoItem; quantity: number }> = [];
  const remaining: LoadingResult['remaining'] = [...preflight.rejected];
  const autoCorrections: AutoCorrectionRecord[] = [];
  let loadedWeightKg = 0;
  let usedVolumeM3 = 0;
  const cargoById = new Map(normalizedCargo.map((item) => [item.id, item]));
  const prioritized = prioritizedCargo(normalizedCargo, strategy);
  let shelf: PureShelf = { x: 0, usedY: 0, depth: 0 };

  // 1차 순수 구역: SKU별 완성 세로 스택만 만든다.
  // 열린 x 선반의 남은 폭은 다음 완성 스택이 사용할 수 있고, 회전 허용 품목은
  // 남은 폭을 더 잘 채우는 90° 방향을 스택별로 선택한다.
  for (const item of prioritized) {
    const orientations = stackOrientations(container, item);
    if (!orientations.length) {
      deferred.push({ item, quantity: item.quantity });
      continue;
    }

    const stackSize = orientations[0].layersHigh;
    const stackWeightKg = stackSize * item.weightKg;
    const completeStackCount = Math.floor(item.quantity / stackSize);
    let placed = 0;

    for (let stackIndex = 0; stackIndex < completeStackCount; stackIndex += 1) {
      if (loadedWeightKg + stackWeightKg > container.maxPayloadKg + EPS) break;

      let orientation = chooseShelfOrientation(container, shelf, orientations);
      if (!orientation) {
        if (shelf.depth <= EPS) break;
        shelf = nextShelf(shelf);
        orientation = chooseShelfOrientation(container, shelf, orientations);
      }
      if (!orientation) break;

      const stack = buildVerticalStack(
        item,
        shelf.x,
        shelf.usedY,
        orientation,
        placements,
        cargoById,
      );
      if (!stack || stack.length !== stackSize) break;

      placements.push(...stack);
      placed += stackSize;
      loadedWeightKg += stackWeightKg;
      usedVolumeM3 += cbm(item) * stackSize;
      shelf.usedY += orientation.width;
      shelf.depth = Math.max(shelf.depth, orientation.length);

      if (shelf.usedY >= container.width - EPS) shelf = nextShelf(shelf);
    }

    if (placed < item.quantity) deferred.push({ item, quantity: item.quantity - placed });
  }

  // 2차 최종 혼합구역: 순수 스택의 가장 문쪽 끝 이후에서만 시작한다.
  const mixedZoneStartX = furthestTail(placements);

  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;
    for (let i = 0; i < quantity; i += 1) {
      if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) break;
      const placement = findMixedPlacement(container, item, placements, cargoById, {
        minX: mixedZoneStartX,
        preferVerticalStack: true,
      });
      if (!placement) break;
      placements.push(placement);
      mixedPlaced += 1;
      loadedWeightKg += item.weightKg;
      usedVolumeM3 += cbm(item);
    }
    const left = quantity - mixedPlaced;
    if (left > 0) {
      const nextBoxWouldExceedPayload = loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS;
      remaining.push({
        cargoId: item.id,
        quantity: left,
        reason: nextBoxWouldExceedPayload
          ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
          : '문쪽 최종 혼합구역에서 회전·경계·지지·적층단·상부 허용중량 조건을 만족하는 안전한 위치를 찾지 못함',
      });
    }
  }

  const result: LoadingResult = {
    placements,
    remaining,
    loadedWeightKg,
    usedVolumeM3,
    validationIssues: validatePlacements(container, placements),
    autoCorrections,
  };
  if (shouldPublish) {
    publishCorrections(autoCorrections);
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}
