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

  let placements: Placement[] = [];
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
      fitCount(container.length, orientation.length) < 1
    ) {
      deferred.push({ item, quantity: item.quantity });
      continue;
    }

    // DIRECT BOX의 순수 SKU 블록은 전략에 따라 일부러 낮게 만들지 않는다.
    // 안정성/하역 전략도 항상 컨테이너 높이, 최대 적층단, 상부허용중량이 허용하는
    // '완성 세로 스택'을 먼저 만든다. 전략 차이는 SKU 우선순위와 물리검증에서만 둔다.
    const columnsAcross = orientation.columnsAcross;
    const layersHigh = orientation.layersHigh;
    let placed = 0;

    // 일반 적재 구역에서는 같은 SKU를 안쪽부터 세로 스택으로 끝까지 완성한 뒤
    // 옆 열로 이동한다. 마지막 수량이 완성 스택을 만들지 못하면 순수 블록에
    // 낮게 남기지 않고 최종 혼합구역으로 넘긴다.
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
            y: col * orientation.width,
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

  // 혼합적재는 최후 잔량만 대상으로 한다. findMixedPlacement는 같은 x/y의
  // 세로 스택 완성을 새 바닥 칸보다 먼저 선택하도록 하여 계단형/낱개형 잔량을 줄인다.
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

  // DIRECT BOX에서는 적재 완료 후 개별 박스를 다시 문쪽으로 이동시키는 shape 후처리를
  // 사용하지 않는다. 순수 블록과 최종 혼합구역의 경계를 생성 단계에서 확정해
  // 고립 박스가 더 바깥으로 밀려나는 현상을 원천 차단한다.
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
