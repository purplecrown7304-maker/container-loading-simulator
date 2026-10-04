import { aConfig, isARules } from './loadingRuleset';
import { validateAPlan } from './loadSimAdapter';
import { centerPalletPlan } from './palletCentering';
import {
  absorbSparsePallets,
  applyTopLayerFillPolicy,
  defaultPalletSpec,
  packOnPallets as packOnPalletsBase,
  buildPalletLoadFromDeckPlacements,
  palletTopLayerFill,
  placeTopTierHolesInsideAll,
  type PalletLoad,
  type PalletPackingResult,
  type PalletSpec,
} from './palletPacking';
import { centeredPalletLaneLayout } from './palletLaneLayout';
import { containerInputError, preflightCargoInput, type RejectedCargoRow } from './inputPreflight';
import type { CargoItem, ContainerSpec, Placement } from './types';
import type { LoadingStrategy } from './loadingEngine';
import { operationalQuality, unloadingObstructions } from './operationalQuality';
import { palletBuildStrategy, cargoWithUnloadingPolicy } from './unloadingPolicy';
import { palletDestinationFit } from './palletDestination';

export { defaultPalletSpec };
export type { PalletLoad, PalletPackingResult, PalletSpec };

const EPS = 1e-9;
const LOW_UTILIZATION_THRESHOLD = 0.5;
const CONSOLIDATION_HEIGHT_TOLERANCE_M = 0.05;

export type PalletOptimizationMeta = {
  strategy?: LoadingStrategy;
  selectedStackTarget: number;
  candidateCount: number;
  floorPositions: number;
  redistributedForLowUtilization: boolean;
  consolidationPasses: number;
};

export type OptimizedPalletPackingResult = PalletPackingResult & {
  optimization: PalletOptimizationMeta;
};

function palletInputError(pallet: PalletSpec) {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;
  if (!positive(pallet.length) || !positive(pallet.width) || !positive(pallet.height)) {
    return '팔레트 길이·폭·높이는 0보다 큰 유한한 값이어야 함';
  }
  if (!nonNegative(pallet.tareWeightKg)) return '팔레트 자중은 0 이상의 유한한 값이어야 함';
  if (!positive(pallet.maxLoadKg)) return '팔레트 최대 적재중량은 0보다 큰 유한한 값이어야 함';
  if (!Number.isInteger(pallet.maxStackLevels) || pallet.maxStackLevels < 1) return '팔레트 최대 적층단은 1 이상의 정수여야 함';
  if (!nonNegative(pallet.maxSupportedTopWeightKg)) return '팔레트 상부 허용중량은 0 이상의 유한한 값이어야 함';
  if (pallet.maxStaticLoadKg !== undefined && !nonNegative(pallet.maxStaticLoadKg)) return '팔레트 정하중은 0 이상의 유한한 값이어야 함';
  if (!nonNegative(pallet.cornerGuardWeightKg) || !nonNegative(pallet.cornerGuardExtraHeightM)) return '각대 중량·추가 높이는 0 이상의 유한한 값이어야 함';
  if (!nonNegative(pallet.wrappingWeightKg) || !nonNegative(pallet.wrappingExtraHeightM)) return '랩핑 중량·추가 높이는 0 이상의 유한한 값이어야 함';
  if (pallet.minTopLayerFillRatio !== undefined && (!Number.isFinite(pallet.minTopLayerFillRatio) || pallet.minTopLayerFillRatio < 0 || pallet.minTopLayerFillRatio > 1)) return '최상단 최소충전율은 0~1 사이의 유한한 값이어야 함';
  return null;
}

function emptyOptimizedResult(remaining: RejectedCargoRow[]): OptimizedPalletPackingResult {
  return {
    pallets: [],
    placements: [],
    remaining,
    palletCount: 0,
    loadedCargoWeightKg: 0,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: 0,
    consolidatedPallets: 0,
    lateralImbalanceKg: 0,
    stackedPallets: 0,
    maxUsedStackLevel: 0,
    optimization: {
      selectedStackTarget: 0,
      candidateCount: 0,
      floorPositions: 0,
      redistributedForLowUtilization: false,
      consolidationPasses: 0,
    },
  };
}

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
  // Always include the full legal-height candidate. Packaging material choices
  // must not force extra pallet bases by silently capping carton tiers.
  const preferredCargoHeight = physicalCargoHeight;
  const perPalletHeight = targetLevels <= 1
    ? physicalCargoHeight
    : Math.max(0, container.height / targetLevels - pallet.height - reserve);

  return cargo.map((item) => {
    const preferredLayers = Math.max(1, Math.floor((preferredCargoHeight + EPS) / item.height));
    const targetLayers = Math.max(0, Math.floor((perPalletHeight + EPS) / item.height));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return {
      ...item,
      maxStackLayers: Math.max(1, Math.min(configured, preferredLayers, Math.max(1, targetLayers))),
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


type DeckFreeRect = { x: number; y: number; length: number; width: number };
const MAX_FINAL_TAIL_DECK_CARTONS = 64;

function packCargoOnSingleDeck(cargo: CargoItem[], pallet: PalletSpec): Placement[] | null {
  const items = cargo
    .flatMap(item => Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, () => item))
    .sort((a, b) =>
      (b.length * b.width) - (a.length * a.width)
      || Math.max(b.length, b.width) - Math.max(a.length, a.width)
      || b.weightKg - a.weightKg
      || a.id.localeCompare(b.id));

  if (!items.length || items.length > MAX_FINAL_TAIL_DECK_CARTONS) return null;
  const totalWeight = items.reduce((sum, item) => sum + item.weightKg, 0);
  const totalArea = items.reduce((sum, item) => sum + item.length * item.width, 0);
  if (totalWeight > pallet.maxLoadKg + EPS || totalArea > pallet.length * pallet.width + EPS) return null;

  let free: DeckFreeRect[] = [{ x: 0, y: 0, length: pallet.length, width: pallet.width }];
  const placed: Placement[] = [];
  const intersects = (a: DeckFreeRect, b: DeckFreeRect) =>
    a.x < b.x + b.length - EPS && a.x + a.length > b.x + EPS
    && a.y < b.y + b.width - EPS && a.y + a.width > b.y + EPS;
  const contains = (outer: DeckFreeRect, inner: DeckFreeRect) =>
    inner.x >= outer.x - EPS && inner.y >= outer.y - EPS
    && inner.x + inner.length <= outer.x + outer.length + EPS
    && inner.y + inner.width <= outer.y + outer.width + EPS;

  for (const item of items) {
    const orientations = [{ length: item.length, width: item.width, rotated: false }];
    if (item.allowRotation !== false && Math.abs(item.length - item.width) > EPS) {
      orientations.push({ length: item.width, width: item.length, rotated: true });
    }

    let best: { freeIndex: number; length: number; width: number; rotated: boolean; score: number[] } | null = null;
    free.forEach((space, freeIndex) => {
      orientations.forEach(option => {
        if (option.length > space.length + EPS || option.width > space.width + EPS) return;
        const remainX = Math.max(0, space.length - option.length);
        const remainY = Math.max(0, space.width - option.width);
        const score = [
          Math.min(remainX, remainY),
          Math.max(remainX, remainY),
          space.length * space.width - option.length * option.width,
          space.y,
          space.x,
          option.rotated ? 1 : 0,
        ];
        if (!best || score.some((value, index) => value < best!.score[index] - EPS
          && score.slice(0, index).every((prior, priorIndex) => Math.abs(prior - best!.score[priorIndex]) <= EPS))) {
          best = { freeIndex, ...option, score };
        }
      });
    });
    if (!best) return null;

    const chosen = best as { freeIndex: number; length: number; width: number; rotated: boolean; score: number[] };
    const space = free[chosen.freeIndex];
    const candidate: Placement = {
      cargoId: item.id,
      x: space.x,
      y: space.y,
      z: 0,
      length: chosen.length,
      width: chosen.width,
      height: item.height,
      weightKg: item.weightKg,
      rotated: chosen.rotated,
    };
    const used: DeckFreeRect = { x: candidate.x, y: candidate.y, length: candidate.length, width: candidate.width };
    placed.push(candidate);

    const split: DeckFreeRect[] = [];
    for (const rect of free) {
      if (!intersects(rect, used)) { split.push(rect); continue; }
      if (used.x > rect.x + EPS) split.push({ x: rect.x, y: rect.y, length: used.x - rect.x, width: rect.width });
      if (used.x + used.length < rect.x + rect.length - EPS) split.push({
        x: used.x + used.length, y: rect.y,
        length: rect.x + rect.length - used.x - used.length, width: rect.width,
      });
      if (used.y > rect.y + EPS) split.push({ x: rect.x, y: rect.y, length: rect.length, width: used.y - rect.y });
      if (used.y + used.width < rect.y + rect.width - EPS) split.push({
        x: rect.x, y: used.y + used.width,
        length: rect.length, width: rect.y + rect.width - used.y - used.width,
      });
    }

    free = split.filter((rect, index, all) => {
      if (rect.length <= EPS || rect.width <= EPS) return false;
      const area = rect.length * rect.width;
      return !all.some((other, otherIndex) => {
        if (otherIndex === index || !contains(other, rect)) return false;
        const otherArea = other.length * other.width;
        return otherArea > area + EPS || (Math.abs(otherArea - area) <= EPS && otherIndex < index);
      });
    });
  }

  return placed;
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
        if (!pallet.minimizePackaging && loadCargoHeight(merged) > originalHeight + CONSOLIDATION_HEIGHT_TOLERANCE_M) continue;
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
 * Final residual-pallet compaction.
 *
 * The top-layer policy can intentionally create a mixed tail after the ordinary
 * consolidation pass. If another top-of-column pallet still exists on the floor,
 * repack the pair together and remove the extra pallet whenever every carton fits
 * one pallet under the same hard weight/geometry/stacking constraints.
 *
 * A floor target is required so removing a stacked source never increases the load
 * carried by another pallet. Unloading mode only combines the same stop.
 */
export function consolidateFinalSparsePallets(
  input: PalletPackingResult,
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec,
  strategy: LoadingStrategy,
) {
  if (input.pallets.length < 2) return { result: input, passes: 0 };
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const stopOfLoad = (load: PalletLoad) => cargoMap.get(load.cargoPlacements[0]?.cargoId)?.unloadPriority ?? 0;
  const isTop = (load: PalletLoad, all: PalletLoad[]) =>
    !all.some(other => other !== load && other.stackColumn === load.stackColumn && other.stackLevel > load.stackLevel);
  const minimumTopFill = pallet.minTopLayerFillRatio ?? 0.5;

  let pallets = input.pallets.map(cloneLoad);
  let passes = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const topLoads = pallets
      .filter(load => load.cargoPlacements.length > 0 && isTop(load, pallets))
      .sort((a, b) => a.cargoWeightKg - b.cargoWeightKg || b.stackLevel - a.stackLevel || a.palletIndex - b.palletIndex);
    const tailSources = topLoads.filter(load => Boolean(load.isMixedTail));

    // The final mixed tail may still fit into an existing regular floor pallet.
    // Try to absorb the tail into any compatible top load, but only keep the merge
    // when the repacked pallet itself satisfies the ordinary top-layer fill rule.
    // This preserves rule #97 for genuinely sparse 4+4+1 style loads while allowing
    // cases such as the live 111 kg + 85 kg pallets to become one dense unit load.
    outer: for (const source of tailSources) {
      for (const target of topLoads) {
        if (source === target || target.stackLevel !== 1) continue;
        if (strategy === 'unloading' && stopOfLoad(source) !== stopOfLoad(target)) continue;
        if (source.cargoWeightKg + target.cargoWeightKg > pallet.maxLoadKg + EPS) continue;

        const pairCargo = cargoCountsFromLoads([target, source], cargoMap);
        const expected = target.cargoPlacements.length + source.cargoPlacements.length;
        const deckPlacements = packCargoOnSingleDeck(pairCargo, pallet);
        if (!deckPlacements || deckPlacements.length !== expected) continue;
        const merged = buildPalletLoadFromDeckPlacements(1, deckPlacements, pallet);
        if (pallet.height + loadCargoHeight(merged) + merged.packagingExtraHeightM > container.height + EPS) continue;
        const mergedTopFill = palletTopLayerFill(merged);
        // Absorbing a final tail into a regular pallet must not recreate the sparse
        // top tier that rule #97 intentionally split off. Two existing mixed tails
        // may still collapse into one unavoidable final tail.
        if (!target.isMixedTail && minimumTopFill > 0 && mergedTopFill + EPS < minimumTopFill) continue;
        const remainsMixedTail = mergedTopFill + EPS < minimumTopFill;

        const shifted = moveLoad(
          { ...merged, isMixedTail: remainsMixedTail || undefined, stackLevel: 1, stackColumn: target.stackColumn },
          target.x,
          target.y,
          0,
        );
        const targetIndex = pallets.indexOf(target);
        const sourceIndex = pallets.indexOf(source);
        if (targetIndex < 0 || sourceIndex < 0) continue;
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
 * Field practice for every strategy: cartons from a nearly empty pallet go onto the
 * spare top layers of other pallets instead of shipping as their own pallet. The
 * unit-load height may grow within the available equipment height. Preferred low
 * height cannot require an extra pallet. Hard limits are enforced in the base packer.
 */
function absorbIntoSpareTopLayers(
  input: PalletPackingResult,
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec,
  strategy: LoadingStrategy,
) {
  if (input.pallets.length < 2) return { result: input, passes: 0 };
  const maxCargoHeight = Math.max(0, container.height - pallet.height - packagingReserve(pallet));
  const absorbed = absorbSparsePallets(input.pallets, cargo, pallet, container, strategy, maxCargoHeight);
  if (!absorbed.removed) return { result: input, passes: 0 };
  return { result: rebuildMetrics(input, absorbed.pallets, absorbed.removed, container), passes: absorbed.removed };
}

function floorSlots(container: ContainerSpec, pallet: PalletSpec) {
  const bands = Math.max(1, Math.floor((container.length + EPS) / pallet.length));
  const lanes = Math.max(1, Math.floor((container.width + EPS) / pallet.width));
  const groupWidth = lanes * pallet.width;
  const yOffset = Math.max(0, (container.width - groupWidth) / 2);
  const slots: Array<{ x: number; y: number }> = [];
  for (let band = 0; band < bands; band += 1) {
    for (let lane = 0; lane < lanes; lane += 1) {
      slots.push({ x: band * pallet.length, y: yOffset + lane * pallet.width });
    }
  }
  return slots;
}

function footprintsOverlap(a: { x: number; y: number }, b: PalletLoad, pallet: PalletSpec) {
  return a.x < b.x + pallet.length - EPS && a.x + pallet.length > b.x + EPS
    && a.y < b.y + pallet.width - EPS && a.y + pallet.width > b.y + EPS;
}

function spreadStacksToFreeFloor(
  input: PalletPackingResult,
  container: ContainerSpec,
  pallet: PalletSpec,
) {
  if (!input.pallets.some((load) => load.stackLevel > 1)) return input;
  const slots = floorSlots(container, pallet);
  const pallets = input.pallets.map(cloneLoad);
  const floorLoads = pallets.filter((load) => load.stackLevel === 1);
  let nextColumn = pallets.reduce((max, load) => Math.max(max, load.stackColumn), 0) + 1;

  const upperIndexes = pallets
    .map((load, index) => ({ load, index }))
    .filter(({ load }) => load.stackLevel > 1)
    .sort((a, b) => b.load.stackLevel - a.load.stackLevel || b.load.totalWeightKg - a.load.totalWeightKg);

  for (const { index } of upperIndexes) {
    const slot = slots.find((candidate) => !floorLoads.some((floor) => footprintsOverlap(candidate, floor, pallet)));
    if (!slot) break;
    const moved = moveLoad(pallets[index], slot.x, slot.y, 0);
    moved.stackLevel = 1;
    moved.stackColumn = nextColumn++;
    pallets[index] = moved;
    floorLoads.push(moved);
  }

  return rebuildMetrics(input, pallets, 0, container);
}

function resultVolumeUtilization(input: PalletPackingResult, container: ContainerSpec) {
  const volume = input.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0);
  return volume / Math.max(EPS, container.length * container.width * container.height);
}

function redistributeForLowUtilization(
  input: PalletPackingResult,
  container: ContainerSpec,
  pallet: PalletSpec,
) {
  const utilization = resultVolumeUtilization(input, container);
  if (utilization >= LOW_UTILIZATION_THRESHOLD || input.pallets.length < 2) return { result: input, redistributed: false };

  const byColumn = new Map<number, PalletLoad[]>();
  for (const palletLoad of input.pallets) {
    const list = byColumn.get(palletLoad.stackColumn) ?? [];
    list.push(cloneLoad(palletLoad));
    byColumn.set(palletLoad.stackColumn, list);
  }
  const columns = [...byColumn.entries()].sort((a, b) => Math.min(...a[1].map((p) => p.x)) - Math.min(...b[1].map((p) => p.x)));
  const layout = centeredPalletLaneLayout(container, pallet, columns.length);

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

/** betterCandidate's order up to, but not including, the balance (imbalance) tie-break. */
function betterCandidateWithoutBalance(a: PalletPackingResult, b: PalletPackingResult, minimizePackaging: boolean): boolean | null {
  const A = candidateScoreTuple(a);
  const B = candidateScoreTuple(b);
  if (A.loaded !== B.loaded) return A.loaded > B.loaded;
  if (minimizePackaging) {
    if (A.pallets !== B.pallets) return A.pallets < B.pallets;
    if (Math.abs(a.totalPackagingWeightKg - b.totalPackagingWeightKg) > EPS) return a.totalPackagingWeightKg < b.totalPackagingWeightKg;
  }
  if (A.stacked !== B.stacked) return A.stacked < B.stacked;
  if (A.maxStackLevel !== B.maxStackLevel) return A.maxStackLevel < B.maxStackLevel;
  if (Math.abs(A.maxUnitHeight - B.maxUnitHeight) > EPS) return A.maxUnitHeight < B.maxUnitHeight;
  return null;
}

function betterCandidate(a: PalletPackingResult, b: PalletPackingResult, minimizePackaging: boolean) {
  const A = candidateScoreTuple(a);
  const B = candidateScoreTuple(b);
  if (A.loaded !== B.loaded) return A.loaded > B.loaded;
  if (minimizePackaging) {
    if (A.pallets !== B.pallets) return A.pallets < B.pallets;
    if (Math.abs(a.totalPackagingWeightKg - b.totalPackagingWeightKg) > EPS) return a.totalPackagingWeightKg < b.totalPackagingWeightKg;
  }
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
  strategy: LoadingStrategy = 'capacity',
): OptimizedPalletPackingResult {
  const originalContainer=container;
  const buildStrategy = palletBuildStrategy(container, strategy);
  const preflight = preflightCargoInput(cargo);
  const normalizedCargo = cargoWithUnloadingPolicy(container, preflight.cargo);
  const configurationError = containerInputError(container) ?? palletInputError(pallet)
    ?? (palletDestinationFit(container, pallet).status === 'incompatible' ? 'PALLET_LIMIT: 수령처 지정 팔레트 규격과 일치하지 않음' : null);
  if (configurationError) {
    return emptyOptimizedResult([
      ...preflight.rejected,
      ...normalizedCargo.map((item) => ({ cargoId: item.id, quantity: item.quantity, reason: configurationError })),
    ]);
  }

  if(isARules(container)) {
    const cfg=aConfig(container);
    // Vehicle clearances restrict the planning envelope, not the pallet's internal footprint.
    container={...container,length:container.length-cfg.margins.l/1000,width:container.width-cfg.margins.w/1000,height:container.height-(cfg.margins.h+cfg.forkliftClearance)/1000,rules:undefined};
  }
  const configuredMax = Math.max(1, Math.floor(pallet.maxStackLevels || 1));
  const physicalMax = Math.max(1, Math.floor((container.height + EPS) / Math.max(pallet.height, EPS)));
  const maxTarget = Math.min(configuredMax, physicalMax);
  const candidates: Array<{ result: PalletPackingResult; target: number; passes: number }> = [];

  for (let target = 1; target <= maxTarget; target += 1) {
    const candidateCargo = cargoForStackTarget(container, normalizedCargo, pallet, target);
    const packed = packOnPalletsBase(container, candidateCargo, { ...pallet, maxStackLevels: target }, buildStrategy);
    const consolidated = buildStrategy === 'unloading' ? { result: packed, passes: 0 } : consolidateUntilStable(packed, container, candidateCargo, pallet);
    // Declared carton limits (not the per-target planning cap) govern the absorb pass.
    const absorbed = absorbIntoSpareTopLayers(consolidated.result, container, normalizedCargo, pallet, buildStrategy);
    const topLayered = applyTopLayerFillPolicy(absorbed.result, normalizedCargo, { ...pallet, maxStackLevels: target }, container, buildStrategy);
    const finalConsolidated = consolidateFinalSparsePallets(topLayered, container, normalizedCargo, { ...pallet, maxStackLevels: target }, buildStrategy);
    candidates.push({ result: finalConsolidated.result, target, passes: consolidated.passes + absorbed.passes + finalConsolidated.passes });
  }

  // Keep lower alternatives for equal pallet counts, or when hard checks reject
  // a taller plan. Height preference must not consume extra pallet bases.
  // Every profile only tightens declared limits; the original remains a candidate.
  const excessiveHeight = candidates.some(candidate => maxUnitLoadHeight(candidate.result) > Math.min(pallet.length, pallet.width) * 2);
  const heightProfiles = strategy === 'stability' ? [.6, .9, 1.2, 1.5] : excessiveHeight ? [1.2, 1.5] : [];
  for (const ratio of heightProfiles) {
    const height = Math.min(pallet.length, pallet.width) * ratio;
    const lowCargo = normalizedCargo.map(item => ({ ...item, maxStackLayers: Math.min(item.maxStackLayers ?? Infinity, Math.max(1, Math.floor((height + EPS) / item.height))) }));
    const packed = packOnPalletsBase(container, lowCargo, pallet, buildStrategy);
    const absorbed = absorbIntoSpareTopLayers(packed, container, normalizedCargo, pallet, buildStrategy);
    const topLayered = applyTopLayerFillPolicy(absorbed.result, normalizedCargo, pallet, container, buildStrategy);
    const finalConsolidated = consolidateFinalSparsePallets(topLayered, container, normalizedCargo, pallet, buildStrategy);
    candidates.push({ result: finalConsolidated.result, target: pallet.maxStackLevels, passes: absorbed.passes + finalConsolidated.passes });
  }
  const errors=new WeakMap<PalletPackingResult,number>();
  const hardErrors=(result:PalletPackingResult)=>{
    if(!isARules(originalContainer))return 0;
    const cached=errors.get(result);if(cached!==undefined)return cached;
    const p=centerPalletPlan(result,originalContainer);
    const n=validateAPlan(originalContainer,normalizedCargo,p.placements,p.pallets.map(s=>({id:String(s.palletIndex),x:s.x,y:s.y,z:s.z,length:s.length,width:s.width,height:s.height,weightKg:s.totalWeightKg-s.cargoWeightKg,unitCenterOfGravity:s.centerOfGravity,unitHeightM:Math.max(s.height,...s.cargoPlacements.map(b=>b.z+b.height-s.z))+s.packagingExtraHeightM}))).filter(f=>f.severity==='error').length;
    errors.set(result,n);return n;
  };
  const preference = (a: PalletPackingResult, b: PalletPackingResult) => {
    const errorDiff=hardErrors(a)-hardErrors(b);if(errorDiff)return errorDiff<0;
    if (a.placements.length !== b.placements.length) return a.placements.length > b.placements.length;
    if (buildStrategy === 'unloading') {
      const blockedA = unloadingObstructions(normalizedCargo, a.placements), blockedB = unloadingObstructions(normalizedCargo, b.placements);
      if (blockedA !== blockedB) return blockedA < blockedB;
    }
    // Pallet loading follows field practice for every strategy: consolidate the
    // shipment first. Center of gravity is the last preference (대표 지시 2026-09-29).
    if (a.palletCount !== b.palletCount) return a.palletCount < b.palletCount;
    const tallA = Math.max(0, maxUnitLoadHeight(a) / Math.min(pallet.length, pallet.width) - 2);
    const tallB = Math.max(0, maxUnitLoadHeight(b) / Math.min(pallet.length, pallet.width) - 2);
    if (Math.abs(tallA - tallB) > EPS) return tallA < tallB;
    if (strategy !== 'stability') {
      // Do not consume more floor positions merely to lower an already supported load.
      const floorDiff = floorPositionCount(a) - floorPositionCount(b);
      if (floorDiff) return floorDiff < 0;
    }
    const nonCog = betterCandidateWithoutBalance(a, b, pallet.minimizePackaging);
    if (nonCog !== null) return nonCog;
    if (strategy === 'stability') {
      const qa = operationalQuality(container, a.placements), qb = operationalQuality(container, b.placements);
      if (Math.abs(qa.cogHeight - qb.cogHeight) > EPS) return qa.cogHeight < qb.cogHeight;
    }
    return betterCandidate(a, b, pallet.minimizePackaging);
  };

  // Below 50% container volume, use an available floor pallet position before
  // stacking one pallet unit-load on another. This keeps low-CBM shipments low and
  // easy to secure while preserving pallet count and every hard constraint.
  // Stability mode keeps its existing always-spread behavior.
  for (const candidate of candidates) {
    if (strategy === 'stability' || resultVolumeUtilization(candidate.result, container) < LOW_UTILIZATION_THRESHOLD) {
      candidate.result = spreadStacksToFreeFloor(candidate.result, container, pallet);
    }
  }
  let selected = candidates[0] ?? {
    result: packOnPalletsBase(container, normalizedCargo, pallet),
    target: 1,
    passes: 0,
  };
  for (const candidate of candidates.slice(1)) {
    if (preference(candidate.result, selected.result)) selected = candidate;
  }

  const redistributed = strategy === 'stability'
    ? redistributeForLowUtilization(selected.result, container, pallet)
    : { result: selected.result, redistributed: false };
  if (buildStrategy === 'unloading') {
    const groups = new Map<number, PalletLoad[]>();
    for (const load of redistributed.result.pallets) groups.set(load.stackColumn, [...(groups.get(load.stackColumn) ?? []), load]);
    const columns = [...groups.values()];
    const slots = columns.map(loads => ({ x: loads[0].x, y: loads[0].y })).sort((a, b) => a.x - b.x || a.y - b.y);
    const priority = new Map(normalizedCargo.map(item => [item.id, item.unloadPriority ?? 0]));
    const stop = (loads: PalletLoad[]) => Math.min(...loads.flatMap(load => load.cargoPlacements.map(p => priority.get(p.cargoId) ?? 0)));
    columns.sort((a, b) => stop(b) - stop(a) || a[0].stackColumn - b[0].stackColumn);
    const moved = columns.flatMap((loads, i) => loads.map(load => moveLoad(load, slots[i].x, slots[i].y)));
    redistributed.result = rebuildMetrics(redistributed.result, moved, 0, container);
  }
  // Terminal layout pass: weight-limited top tiers keep unavoidable empty slots on
  // the perimeter instead of leaving visible holes inside the top surface. Carton set,
  // pallet assignment and every hard safety constraint remain unchanged.
  const cargoById = new Map(normalizedCargo.map(item => [item.id, item]));
  const holesArranged = placeTopTierHolesInsideAll(redistributed.result.pallets, cargoById, pallet);
  if (holesArranged.some((load, index) => load !== redistributed.result.pallets[index])) {
    redistributed.result = rebuildMetrics(redistributed.result, holesArranged, 0, container);
  }
  return {
    ...redistributed.result,
    remaining: [...preflight.rejected, ...redistributed.result.remaining],
    optimization: {
      strategy,
      selectedStackTarget: selected.target,
      candidateCount: candidates.length,
      floorPositions: floorPositionCount(redistributed.result),
      redistributedForLowUtilization: redistributed.redistributed,
      consolidationPasses: selected.passes,
    },
  };
}
