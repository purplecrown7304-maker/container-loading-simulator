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
  const topLoadLimit = Math.max(0, item.maxTopLoadKg);
  const byTopLoad = 1 + Math.floor((topLoadLimit + EPS) / Math.max(item.weightKg, EPS));
  return Math.max(1, Math.min(stackLimit, byTopLoad));
}

function bestBlockOrientation(container: ContainerSpec, item: CargoItem) {
  const options = [
    { length: item.length, width: item.width, rotated: false },
    ...(item.allowRotation === false || Math.abs(item.length - item.width) < EPS
      ? []
      : [{ length: item.width, width: item.length, rotated: true }]),
  ];
  const safeStackLayers = safeIdenticalStackLayers(item);
  return options
    .map((option) => {
      const columnsAcross = fitCount(container.width, option.width);
      const layersHigh = Math.min(safeStackLayers, fitCount(container.height, item.height));
      const slicesDeep = fitCount(container.length, option.length);
      return {
        ...option,
        columnsAcross,
        layersHigh,
        capacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh) * Math.max(0, slicesDeep),
        sliceCapacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh),
      };
    })
    .sort((a, b) => b.capacity - a.capacity || b.sliceCapacity - a.sliceCapacity || a.length - b.length)[0];
}

function furthestTail(placements: Placement[]) {
  return placements.reduce((tail, placement) => Math.max(tail, placement.x + placement.length), 0);
}

function mixedTailStart(item: CargoItem, placements: Placement[], cargoById: Map<string, CargoItem>) {
  let sameCargoTail = 0;
  let heavierCargoTail = 0;
  for (const placement of placements) {
    const tail = placement.x + placement.length;
    if (placement.cargoId === item.id) sameCargoTail = Math.max(sameCargoTail, tail);
    const placedCargo = cargoById.get(placement.cargoId);
    if (placedCargo && placedCargo.weightKg > item.weightKg + EPS) {
      heavierCargoTail = Math.max(heavierCargoTail, tail);
    }
  }
  return Math.max(sameCargoTail, heavierCargoTail);
}

function buildCompleteSlice(
  item: CargoItem,
  x: number,
  columnsAcross: number,
  layersHigh: number,
  orientation: { length: number; width: number; rotated: boolean },
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
) {
  const slice: Placement[] = [];
  for (let col = 0; col < columnsAcross; col += 1) {
    for (let layer = 0; layer < layersHigh; layer += 1) {
      const candidate: Placement = {
        cargoId: item.id,
        x,
        y: col * orientation.width,
        z: layer * item.height,
        length: orientation.length,
        width: orientation.width,
        height: item.height,
        weightKg: item.weightKg,
        rotated: orientation.rotated,
      };
      if (!canPlaceByStackingRules(item, candidate, [...placements, ...slice], cargoById)) return null;
      slice.push(candidate);
    }
  }
  return slice;
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

  let cursorX = 0;
  for (const item of prioritized) {
    const orientation = bestBlockOrientation(container, item);
    if (
      orientation.columnsAcross < 1 ||
      orientation.layersHigh < 1 ||
      orientation.sliceCapacity < 1 ||
      fitCount(container.length, orientation.length) < 1
    ) {
      deferred.push({ item, quantity: item.quantity });
      continue;
    }

    const columnsAcross = orientation.columnsAcross;
    const layersHigh = orientation.layersHigh;
    const sliceCapacity = orientation.sliceCapacity;
    const sliceWeightKg = sliceCapacity * item.weightKg;
    let placed = 0;

    // 순수 SKU 영역에는 가로 전체 × 안전 최대 높이의 완전한 직사각 슬라이스만 넣는다.
    // 마지막에 폭 일부만 채운 좁은 탑을 남기지 않고, 완전 슬라이스를 못 만드는 수량은
    // 전부 문쪽 최종 혼합구역으로 보내 다른 잔량과 함께 압축한다.
    while (placed + sliceCapacity <= item.quantity) {
      if (cursorX + orientation.length > container.length + EPS) break;
      if (loadedWeightKg + sliceWeightKg > container.maxPayloadKg + EPS) break;

      const slice = buildCompleteSlice(
        item,
        cursorX,
        columnsAcross,
        layersHigh,
        orientation,
        placements,
        cargoById,
      );
      if (!slice || slice.length !== sliceCapacity) break;

      placements.push(...slice);
      placed += sliceCapacity;
      loadedWeightKg += sliceWeightKg;
      usedVolumeM3 += cbm(item) * sliceCapacity;
      cursorX += orientation.length;
    }

    if (placed < item.quantity) deferred.push({ item, quantity: item.quantity - placed });
  }

  // 순수 블록은 여기까지 연속된 직사각형 구역이다. 잔량은 이 x보다 안쪽으로 돌아가지 않는다.
  const mixedZoneStartX = furthestTail(placements);

  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;
    const minX = Math.max(mixedZoneStartX, mixedTailStart(item, placements, cargoById));
    for (let i = 0; i < quantity; i += 1) {
      if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) break;
      const placement = findMixedPlacement(container, item, placements, cargoById, {
        minX,
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
          : '문쪽 혼합적재 구역에서 동일 품목 완성 스택·CBM/중량 순서·회전·경계·적층단·상부 허용중량 조건을 만족하는 안전한 위치를 찾지 못함',
      });
    }
  }

  // 생성 후 개별 박스를 더 문쪽으로 밀어내는 shape 후처리는 사용하지 않는다.
  // 블록성과 압축은 생성 단계에서 결정해 고립 박스/계단형 적재를 만들지 않는다.
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
