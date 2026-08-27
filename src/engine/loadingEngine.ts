import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { validatePlacements } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { optimizeLoadingShape } from './shapeOptimizer';
import { readManualOverride } from './manualOverride';

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
    // 기본 작업 순서: SKU별 총 CBM이 큰 화물부터 안쪽에 배치하고,
    // CBM이 비슷하면 총중량/개당중량이 큰 화물을 먼저 둔다.
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

function bestBlockOrientation(container: ContainerSpec, item: CargoItem) {
  const options = [
    { length: item.length, width: item.width, rotated: false },
    ...(item.allowRotation === false || Math.abs(item.length - item.width) < EPS
      ? []
      : [{ length: item.width, width: item.length, rotated: true }]),
  ];
  return options
    .map((option) => {
      const columnsAcross = fitCount(container.width, option.width);
      const layersHigh = Math.min(item.maxStackLayers ?? Number.POSITIVE_INFINITY, fitCount(container.height, item.height));
      const slicesDeep = fitCount(container.length, option.length);
      return { ...option, columnsAcross, layersHigh, capacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh) * Math.max(0, slicesDeep), sliceCapacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh) };
    })
    .sort((a, b) => b.capacity - a.capacity || b.sliceCapacity - a.sliceCapacity || a.length - b.length)[0];
}

function strategyGeometry(strategy: LoadingStrategy, columnsAcross: number, layersHigh: number) {
  if (strategy === 'stability') {
    return {
      columns: columnsAcross > 2 ? columnsAcross - 1 : columnsAcross,
      layers: Math.max(1, Math.ceil(layersHigh * 0.72)),
      centered: true,
    };
  }
  if (strategy === 'unloading') {
    return {
      columns: columnsAcross,
      layers: Math.max(1, Math.ceil(layersHigh * 0.86)),
      centered: false,
    };
  }
  return { columns: columnsAcross, layers: layersHigh, centered: false };
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

export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const strategy = options.strategy ?? browserStrategy();
  const shouldPublish = options.publish !== false;
  if (shouldPublish && options.strategy === undefined) {
    const manual = readManualOverride(container,cargo);
    if (manual) {
      publishCorrections(manual.autoCorrections ?? []);
      publishLoadingResult(container,cargo,manual);
      return manual;
    }
  }

  let placements: Placement[] = [];
  const deferred: Array<{ item: CargoItem; quantity: number }> = [];
  const remaining: LoadingResult['remaining'] = [];
  const autoCorrections: AutoCorrectionRecord[] = [];
  let loadedWeightKg = 0;
  let usedVolumeM3 = 0;
  const cargoById = new Map(cargo.map((item) => [item.id, item]));
  const prioritized = prioritizedCargo(cargo, strategy);

  let cursorX = 0;
  for (const item of prioritized) {
    const orientation = bestBlockOrientation(container, item);
    if (
      orientation.columnsAcross < 1 ||
      orientation.layersHigh < 1 ||
      fitCount(container.length, orientation.length) < 1
    ) {
      deferred.push({ item, quantity: item.quantity });
      continue;
    }
    const rawColumns = orientation.columnsAcross;
    const rawLayers = orientation.layersHigh;
    const geometry = strategyGeometry(strategy, rawColumns, rawLayers);
    const columnsAcross = Math.max(1, geometry.columns);
    const layersHigh = Math.max(1, geometry.layers);
    const occupiedWidth = columnsAcross * orientation.width;
    const yOffset = geometry.centered ? Math.max(0, (container.width - occupiedWidth) / 2) : 0;
    let placed = 0;

    // 일반 적재 구역에서는 세로 스택을 끝까지 완성할 수 있을 때만 배치한다.
    // 한 SKU의 마지막 수량이 천장(또는 허용 적층단)까지 못 올라가면 여기서 억지로
    // 낮은 산 모양을 만들지 않고 전량을 후순위 혼합적재로 넘긴다.
    while (placed + layersHigh <= item.quantity) {
      if (cursorX + orientation.length > container.length + EPS) break;
      let stacksPlacedInSlice = 0;

      for (let col = 0; col < columnsAcross && placed + layersHigh <= item.quantity; col += 1) {
        const stackWeightKg = layersHigh * item.weightKg;
        if (loadedWeightKg + stackWeightKg > container.maxPayloadKg + EPS) break;

        const stack: Placement[] = [];
        let validStack = true;
        for (let layer = 0; layer < layersHigh; layer += 1) {
          const candidate: Placement = {
            cargoId: item.id,
            x: cursorX,
            y: yOffset + col * orientation.width,
            z: layer * item.height,
            length: orientation.length,
            width: orientation.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated: orientation.rotated,
          };
          if (!canPlaceByStackingRules(item, candidate, [...placements, ...stack], cargoById)) {
            validStack = false;
            break;
          }
          stack.push(candidate);
        }
        if (!validStack) continue;

        placements.push(...stack);
        placed += layersHigh;
        stacksPlacedInSlice += 1;
        loadedWeightKg += stackWeightKg;
        usedVolumeM3 += cbm(item) * layersHigh;
      }

      if (stacksPlacedInSlice === 0) break;
      cursorX += orientation.length;
      if (stacksPlacedInSlice < columnsAcross) break;
    }

    if (placed < item.quantity) deferred.push({ item, quantity: item.quantity - placed });
  }

  // 순수 SKU 블록이 끝난 지점을 혼합적재 구역의 시작점으로 고정한다.
  // 이 경계보다 안쪽으로 잔량을 되돌려 넣지 않으므로 컨테이너 중간에 혼합 박스가
  // 끼어드는 현상을 막고, 문쪽 마지막 영역에서만 잔량을 정리한다.
  const mixedZoneStartX = furthestTail(placements);

  // 혼합적재는 최후 잔량만 대상으로 한다. 더 무거운 화물의 뒤쪽에서만
  // 이어 붙여 가벼움-무거움-가벼움 형태의 종방향 샌드위치를 만들지 않는다.
  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;
    const minX = Math.max(mixedZoneStartX, mixedTailStart(item, placements, cargoById));
    for (let i = 0; i < quantity; i += 1) {
      if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) break;
      const placement = findMixedPlacement(container, item, placements, cargoById, { minX });
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

  const shapeResult = optimizeLoadingShape(container, placements, cargoById);
  placements = shapeResult.placements;
  if (shapeResult.movedCount > 0) autoCorrections.push({ kind: 'SHAPE', label: '품목 묶음 정리', description: `같은 품목의 과도한 분산을 줄이기 위해 최상단 박스 ${shapeResult.movedCount}개를 재배치`, beforeScore: shapeResult.beforePenalty, afterScore: shapeResult.afterPenalty });

  const result: LoadingResult = { placements, remaining, loadedWeightKg, usedVolumeM3, validationIssues: validatePlacements(container, placements), autoCorrections };
  if (shouldPublish) {
    publishCorrections(autoCorrections);
    publishLoadingResult(container, cargo, result);
  }
  return result;
}
