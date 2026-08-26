import {
  defaultPalletSpec,
  packOnPallets as packOnPalletsBase,
  type PalletLoad,
  type PalletPackingResult,
  type PalletSpec,
} from './palletPacking';
import { centeredPalletLaneLayout } from './palletLaneLayout';
import type { CargoItem, ContainerSpec } from './types';

export { defaultPalletSpec };
export type { PalletLoad, PalletPackingResult, PalletSpec };

const EPS = 1e-9;
const LOW_UTILIZATION_THRESHOLD = 0.5;
const STABLE_UNIT_LOAD_HEIGHT_RATIO = 1.15;
const CONSOLIDATION_HEIGHT_TOLERANCE_M = 0.05;

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

function loadCargoHeight(load: PalletLoad) {
  if (!load.cargoPlacements.length) return 0;
  const top = Math.max(...load.cargoPlacements.map((placement) => placement.z + placement.height));
  return Math.max(0, top - load.z - load.height);
}

function maxUnitLoadHeight(result: PalletPackingResult) {
  return result.pallets.reduce((max, load) => Math.max(max, loadCargoHeight(load)), 0);
}

function packagingReserve(pallet: PalletSpec) {
  if (pallet.minimizePackaging) return 0;
  return (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0) +
    (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
}

function cargoForStackTarget(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec, targetLevels: number) {
  const reserve = packagingReserve(pallet);
  const physicalCargoHeight = Math.max(0, container.height - pallet.height - reserve);
  const stableCargoHeight = Math.min(
    physicalCargoHeight,
    Math.min(pallet.length, pallet.width) * STABLE_UNIT_LOAD_HEIGHT_RATIO,
  );
  const perPalletHeight = targetLevels <= 1
    ? physicalCargoHeight
    : Math.max(0, container.height / targetLevels - pallet.height - reserve);

  return cargo.map((item) => {
    const stableLayers = Math.max(1, Math.floor((stableCargoHeight + EPS) / item.height));
    const targetLayers = Math.max(0, Math.floor((perPalletHeight + EPS) / item.height));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return {
      ...item,
      maxStackLayers: Math.max(1, Math.min(configured, stableLayers, Math.max(1, targetLayers))),
    };
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
    const delta = pallet.centerOfGravity.y - container.width / 2;
    if (Math.abs(delta) < 1e-6) continue;
    if (delta < 0) left += pallet.totalWeightKg;
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
    maxUsedStackLevel: normalized.length ? normalized.reduce((max, pallet) => Math.max(max, pallet.stackLevel), 1) : 0,
    lateralImbalanceKg: recalcLateralImbalance(normalized, container),
  };
}

function canPairMerge(first: PalletLoad, second: PalletLoad, all: PalletLoad[]) {
  const firstHasStackMate = all.some((pallet) => pallet !== first && pallet.stackColumn === first.stackColumn);
  const secondHasStackMate = all.some((pallet) => pallet !== second && pallet.stackColumn === second.stackColumn);
  return first.stackLevel === 1 && second.stackLevel === 1 && !firstHasStackMate && !secondHasStackMate;
}

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
        const originalHeight = Math.max(loadCargoHeight(target), loadCargoHeight(source));
        if (loadCargoHeight(merged) > originalHeight + CONSOLIDATION_HEIGHT_TOLERANCE_M) continue;
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
  const layout = centeredPalletLaneLayout(container, pallet, columns.length);

  // 컨테이너의 물리적 팔레트 슬롯 수를 넘는 경우에는 기존 안전 배치를 유지한다.
  if (columns.length > layout.maxBands * layout.rowCapacity) return { result: input, redistributed: false };

  const moved: PalletLoad[] = [];
  columns.forEach(([, loads], columnIndex) => {
    const band = Math.floor(columnIndex / layout.laneCount);
    const lane = columnIndex % layout.laneCount;
    const x = Math.min(container.length - pallet.length, layout.xSlots[band] ?? 0);
    const y = Math.min(container.width - pallet.width, layout.ySlots[lane] ?? 0);
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
    stacked: result.stackedPallets,
    maxStackLevel: result.maxUsedStackLevel,
    maxUnitHeight: maxUnitLoadHeight(result),
    imbalance: result.lateralImbalanceKg,
    floorPositions: floorPositionCount(result),
    pallets: result.palletCount,
  };
}

function betterCandidate(a: PalletPackingResult, b: PalletPackingResult) {
  const A = candidateScoreTuple(a);
  const B = candidateScoreTuple(b);
  if (A.loaded !== B.loaded) return A.loaded > B.loaded;
  if (A.stacked !== B.stacked) return A.stacked < B.stacked;
  if (A.maxStackLevel !== B.maxStackLevel) return A.maxStackLevel < B.maxStackLevel;
  if (Math.abs(A.maxUnitHeight - B.maxUnitHeight) > EPS) return A.maxUnitHeight < B.maxUnitHeight;
  if (A.imbalance !== B.imbalance) return A.imbalance < B.imbalance;
  if (A.floorPositions !== B.floorPositions) return A.floorPositions > B.floorPositions;
  return A.pallets < B.pallets;
}

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
