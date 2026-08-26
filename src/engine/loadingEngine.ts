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

function prioritizedCargo(cargo: CargoItem[], strategy: LoadingStrategy): CargoItem[] {
  return [...cargo].sort((a, b) => {
    const weightDiff = b.weightKg - a.weightKg;
    if (Math.abs(weightDiff) > EPS) return weightDiff;
    if (strategy === 'stability') {
      const footprintDiff = b.length * b.width - a.length * a.width;
      if (Math.abs(footprintDiff) > EPS) return footprintDiff;
      return capacityScore(b) - capacityScore(a);
    }
    if (strategy === 'unloading') {
      const unloadDiff = (b.unloadPriority ?? 0) - (a.unloadPriority ?? 0);
      if (unloadDiff !== 0) return unloadDiff;
      return capacityScore(b) - capacityScore(a);
    }
    return capacityScore(b) - capacityScore(a);
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
    const rawColumns = Math.max(1, orientation.columnsAcross);
    const rawLayers = Math.max(1, orientation.layersHigh);
    const geometry = strategyGeometry(strategy, rawColumns, rawLayers);
    const columnsAcross = Math.max(1, geometry.columns);
    const layersHigh = Math.max(1, geometry.layers);
    const occupiedWidth = columnsAcross * orientation.width;
    const yOffset = geometry.centered ? Math.max(0, (container.width - occupiedWidth) / 2) : 0;
    const boxesPerSlice = columnsAcross * layersHigh;
    let placed = 0;

    // 같은 SKU는 완전한 슬라이스만 만들고 잔량을 뒤로 미루지 않는다.
    // 마지막 슬라이스가 일부만 차더라도 현재 SKU 블록 안에서 먼저 채워
    // 동일 품목이 여러 구역으로 갈라지는 것을 최소화한다.
    while (placed < item.quantity) {
      if (cursorX + orientation.length > container.length + EPS) break;
      let slicePlaced = 0;
      let sliceBlocked = false;
      for (let layer = 0; layer < layersHigh && placed < item.quantity; layer += 1) {
        for (let col = 0; col < columnsAcross && placed < item.quantity; col += 1) {
          if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) { sliceBlocked = true; break; }
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
          if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) { sliceBlocked = true; break; }
          placements.push(candidate);
          placed += 1;
          slicePlaced += 1;
          loadedWeightKg += item.weightKg;
          usedVolumeM3 += cbm(item);
        }
        if (sliceBlocked || loadedWeightKg + EPS >= container.maxPayloadKg) break;
      }
      if (slicePlaced === 0) break;
      cursorX += orientation.length;
      if (slicePlaced < boxesPerSlice || sliceBlocked) break;
    }
    if (placed < item.quantity) deferred.push({ item, quantity: item.quantity - placed });
  }

  // 혼합적재는 최후 잔량만 대상으로 한다. 더 무거운 화물의 뒤쪽에서만
  // 이어 붙여 가벼움-무거움-가벼움 형태의 종방향 샌드위치를 만들지 않는다.
  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;
    const minX = mixedTailStart(item, placements, cargoById);
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
          : '동일 품목 블록·중량 흐름·회전·경계·적층단·상부 허용중량 조건을 만족하는 안전한 잔여 위치를 찾지 못함',
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
