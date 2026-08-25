import {
  defaultPalletSpec,
  packOnPallets as packOnPalletsBase,
  type PalletLoad,
  type PalletPackingResult,
  type PalletSpec,
} from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

export { defaultPalletSpec };
export type { PalletLoad, PalletPackingResult, PalletSpec };

const EPS = 1e-9;
const LOW_UTILIZATION_THRESHOLD = 0.5;

export type PalletOptimizationMeta = {
  selectedStackTarget: number;
  candidateCount: number;
  floorPositions: number;
  redistributedForLowUtilization: boolean;
  consolidationPasses: number;
};

export type OptimizedPalletPackingResult = PalletPackingResult & {
  optimization: PalletOptimizationMeta;
};

function cloneLoad(load: PalletLoad): PalletLoad {
  return {
    ...load,
    cargoPlacements: load.cargoPlacements.map((placement) => ({ ...placement })),
    centerOfGravity: { ...load.centerOfGravity },
  };
}

function moveLoad(load: PalletLoad, x: number, y: number, z = load.z): PalletLoad {
  const dx = x - load.x;
  const dy = y - load.y;
  const dz = z - load.z;
  return {
    ...load,
    x,
    y,
    z,
    cargoPlacements: load.cargoPlacements.map((placement) => ({
      ...placement,
      x: placement.x + dx,
      y: placement.y + dy,
      z: placement.z + dz,
    })),
    centerOfGravity: {
      x: load.centerOfGravity.x + dx,
      y: load.centerOfGravity.y + dy,
      z: load.centerOfGravity.z + dz,
    },
  };
}

function floorPositionCount(result: PalletPackingResult) {
  return new Set(result.pallets.map((pallet) => pallet.stackColumn)).size;
}

function loadedCount(result: PalletPackingResult) {
  return result.placements.length;
}

function packagingReserve(pallet: PalletSpec) {
  if (pallet.minimizePackaging) return 0;
  return (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0) +
    (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
}

/**
 * 팔레트 적층 목표가 2~3단일 때 한 팔레트가 컨테이너 높이를 독점하지 않도록
 * 박스 층수를 제한한 별도 후보를 만든다. 기존 최대적층단은 상한으로 유지한다.
 */
function cargoForStackTarget(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec, targetLevels: number) {
  if (targetLevels <= 1) return cargo.map((item) => ({ ...item }));
  const perPalletHeight = Math.max(0, container.height / targetLevels - pallet.height - packagingReserve(pallet));
  return cargo.map((item) => {
    const heightBudgetLayers = Math.max(0, Math.floor((perPalletHeight + EPS) / item.height));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return { ...item, maxStackLayers: Math.min(configured, heightBudgetLayers) };
  });
}

function cargoCountsFromLoads(loads: PalletLoad[], cargoMap: Map<string, CargoItem>) {
  const counts = new Map<string, number>();
  for (const load of loads) {
    for (const placement of load.cargoPlacements) counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);
  }
  return [...counts.entries()].flatMap(([id, quantity]) => {
    const item = cargoMap.get(id);
    return item ? [{ ...item, quantity }] : [];
  });
}

function recalcLateralImbalance(pallets: PalletLoad[], container: ContainerSpec) {
  let left = 0;
  let right = 0;
  for (const pallet of pallets) {
    if (pallet.centerOfGravity.y < container.width / 2) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
  return Math.abs(left - right);
}

function rebuildMetrics(
  base: PalletPackingResult,
  pallets: PalletLoad[],
  extraConsolidated: number,
  container: ContainerSpec,
): PalletPackingResult {
  const normalized = pallets.map((pallet, index) => ({ ...pallet, palletIndex: index + 1 }));
  const placements = normalized.flatMap((pallet) => pallet.cargoPlacements);
  const totalWeight = normalized.reduce((sum, pallet) => sum + pallet.totalWeightKg, 0);
  return {
    ...base,
    pallets: normalized,
    placements,
    palletCount: normalized.length,
    loadedCargoWeightKg: normalized.reduce((sum, pallet) => sum + pallet.cargoWeightKg, 0),
    totalPackagingWeightKg: normalized.reduce((sum, pallet) => sum + pallet.packagingWeightKg, 0),
    packagedPalletCount: normalized.filter((pallet) => pallet.cornerGuardsUsed || pallet.wrappingUsed).length,
    totalPalletizedWeightKg: totalWeight,
    consolidatedPallets: base.consolidatedPallets + extraConsolidated,
    stackedPallets: normalized.filter((pallet) => pallet.stackLevel > 1).length,
    maxUsedStackLevel: normalized.reduce((max, pallet) => Math.max(max, pallet.stackLevel), 1),
    lateralImbalanceKg: recalcLateralImbalance(normalized, container),
  };
}

function canPairMerge(first: PalletLoad, second: PalletLoad, all: PalletLoad[]) {
  const firstHasStackMate = all.some((pallet) => pallet !== first && pallet.stackColumn === first.stackColumn);
  const secondHasStackMate = all.some((pallet) => pallet !== second && pallet.stackColumn === second.stackColumn);
  return first.stackLevel === 1 && second.stackLevel === 1 && !firstHasStackMate && !secondHasStackMate;
}

/**
 * 전체 팔레트 쌍을 반복 탐색한다. 한 쌍의 내용물이 단일 팔레트로 재패킹 가능하면
 * 병합하고 처음부터 다시 탐색하며, 더 이상 병합이 발생하지 않을 때 종료한다.
 */
function consolidateUntilStable(
  input: PalletPackingResult,
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec,
) {
  const cargoMap = new Map(cargo.map((item) => [item.id, item]));
  let pallets = input.pallets.map(cloneLoad);
  let passes = 0;
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let sourceIndex = pallets.length - 1; sourceIndex > 0; sourceIndex -= 1) {
      for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex += 1) {
        const target = pallets[targetIndex];
        const source = pallets[sourceIndex];
        if (!canPairMerge(target, source, pallets)) continue;
        const pairCargo = cargoCountsFromLoads([target, source], cargoMap);
        const expected = target.cargoPlacements.length + source.cargoPlacements.length;
        const virtualContainer: ContainerSpec = {
          length: pallet.length,
          width: pallet.width,
          height: container.height,
          maxPayloadKg: Math.min(
            container.maxPayloadKg,
            pallet.maxLoadKg + pallet.tareWeightKg + pallet.cornerGuardWeightKg + pallet.wrappingWeightKg,
          ),
        };
        const packed = packOnPalletsBase(virtualContainer, pairCargo, { ...pallet, maxStackLevels: 1 });
        if (packed.palletCount !== 1 || packed.placements.length !== expected || packed.remaining.some((item) => item.quantity > 0)) continue;
        const merged = packed.pallets[0];
        const shifted = moveLoad(
          { ...merged, stackLevel: 1, stackColumn: target.stackColumn },
          target.x,
          target.y,
          target.z,
        );
        pallets[targetIndex] = shifted;
        pallets.splice(sourceIndex, 1);
        passes += 1;
        changed = true;
        break outer;
      }
    }
  }

  return { result: rebuildMetrics(input, pallets, passes, container), passes };
}

/**
 * 보고서 권고대로 체적 활용률이 50% 미만이면 팔레트 스택 열을 컨테이너 길이에
 * 균등하게 재배치한다. 같은 stackColumn의 상·하 팔레트는 함께 이동한다.
 */
function redistributeForLowUtilization(
  input: PalletPackingResult,
  container: ContainerSpec,
  pallet: PalletSpec,
) {
  const volume = input.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0);
  const utilization = volume / Math.max(EPS, container.length * container.width * container.height);
  if (utilization >= LOW_UTILIZATION_THRESHOLD || input.pallets.length < 2) return { result: input, redistributed: false };

  const byColumn = new Map<number, PalletLoad[]>();
  for (const palletLoad of input.pallets) {
    const list = byColumn.get(palletLoad.stackColumn) ?? [];
    list.push(cloneLoad(palletLoad));
    byColumn.set(palletLoad.stackColumn, list);
  }
  const columns = [...byColumn.entries()].sort((a, b) => Math.min(...a[1].map((p) => p.x)) - Math.min(...b[1].map((p) => p.x)));
  const rowCapacity = Math.max(1, Math.floor((container.width + EPS) / pallet.width));
  const bandCount = Math.max(1, Math.ceil(columns.length / rowCapacity));
  const maxX = Math.max(0, container.length - pallet.length);
  const xSlots = Array.from({ length: bandCount }, (_, index) =>
    bandCount === 1 ? 0 : index * maxX / (bandCount - 1),
  );
  const ySlots = Array.from({ length: rowCapacity }, (_, index) => index * pallet.width)
    .sort((a, b) => Math.abs(a + pallet.width / 2 - container.width / 2) - Math.abs(b + pallet.width / 2 - container.width / 2));

  const moved: PalletLoad[] = [];
  columns.forEach(([, loads], columnIndex) => {
    const band = Math.floor(columnIndex / rowCapacity);
    const row = columnIndex % rowCapacity;
    const x = Math.min(maxX, xSlots[band] ?? 0);
    const y = Math.min(container.width - pallet.width, ySlots[row] ?? 0);
    loads.forEach((load) => moved.push(moveLoad(load, x, y)));
  });

  moved.sort((a, b) => a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel);
  const result: PalletPackingResult = {
    ...input,
    pallets: moved,
    placements: moved.flatMap((palletLoad) => palletLoad.cargoPlacements),
    lateralImbalanceKg: recalcLateralImbalance(moved, container),
  };
  return { result, redistributed: true };
}

function candidateScoreTuple(result: PalletPackingResult) {
  return {
    loaded: loadedCount(result),
    floorPositions: floorPositionCount(result),
    pallets: result.palletCount,
    imbalance: result.lateralImbalanceKg,
    stacked: result.stackedPallets,
  };
}

function betterCandidate(a: PalletPackingResult, b: PalletPackingResult) {
  const A = candidateScoreTuple(a);
  const B = candidateScoreTuple(b);
  if (A.loaded !== B.loaded) return A.loaded > B.loaded;
  if (A.floorPositions !== B.floorPositions) return A.floorPositions < B.floorPositions;
  if (A.pallets !== B.pallets) return A.pallets < B.pallets;
  if (A.imbalance !== B.imbalance) return A.imbalance < B.imbalance;
  return A.stacked > B.stacked;
}

/**
 * 보고서 기반 팔레트 전역 최적화.
 * 1) 박스 층수 최대 후보와 2~3단 팔레트 적층 후보를 모두 생성한다.
 * 2) 각 후보에서 반복 병합을 수행한다.
 * 3) 적재수량을 보존하면서 바닥 점유 열 수가 가장 적은 후보를 선택한다.
 * 4) 체적 활용률 50% 미만이면 컨테이너 길이에 균등 재배치한다.
 */
export function packOnPallets(
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec = defaultPalletSpec,
): OptimizedPalletPackingResult {
  const maxTarget = Math.max(1, Math.min(3, Math.floor(pallet.maxStackLevels || 1)));
  const candidates: Array<{ result: PalletPackingResult; target: number; passes: number }> = [];

  for (let target = 1; target <= maxTarget; target += 1) {
    const candidateCargo = cargoForStackTarget(container, cargo, pallet, target);
    const packed = packOnPalletsBase(container, candidateCargo, { ...pallet, maxStackLevels: target });
    const consolidated = consolidateUntilStable(packed, container, candidateCargo, pallet);
    candidates.push({ result: consolidated.result, target, passes: consolidated.passes });
  }

  let selected = candidates[0] ?? {
    result: packOnPalletsBase(container, cargo, pallet),
    target: 1,
    passes: 0,
  };
  for (const candidate of candidates.slice(1)) {
    if (betterCandidate(candidate.result, selected.result)) selected = candidate;
  }

  const redistributed = redistributeForLowUtilization(selected.result, container, pallet);
  return {
    ...redistributed.result,
    optimization: {
      selectedStackTarget: selected.target,
      candidateCount: candidates.length,
      floorPositions: floorPositionCount(redistributed.result),
      redistributedForLowUtilization: redistributed.redistributed,
      consolidationPasses: selected.passes,
    },
  };
}
