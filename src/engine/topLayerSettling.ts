import type { BeamPackingOutput } from './blockSpaceBeamPackerV2';
import type { LoadingStrategy } from './loadingEngine';
import { completeResidualPacking } from './residualPacking';
import type { CargoItem, ContainerSpec, Placement } from './types';

/** A top tier holding at most this share of the fullest tier is an isolated top tier. */
export const SPARSE_TOP_LAYER_RATIO = 0.25;
/** Only a sparse tier sitting on a multi-tier load is settled; a partial second tier is ordinary. */
export const SPARSE_TOP_MIN_LEVELS = 3;

const levelKey = (z: number) => Math.round(z * 1000);
const volume = (p: Placement) => p.length * p.width * p.height;

function levels(placements: Placement[]) {
  const byLevel = new Map<number, Placement[]>();
  for (const placement of placements) {
    const key = levelKey(placement.z);
    byLevel.set(key, [...(byLevel.get(key) ?? []), placement]);
  }
  return [...byLevel.entries()].sort(([a], [b]) => a - b);
}

/**
 * Field practice (대표 지시 2026-09-29, #86): a handful of cartons should not ride alone
 * on top of a tall load. Lift the isolated top tier, lower the ceiling to that tier's
 * base and rerun the ordinary residual insertion so cartons land in lower gaps under
 * the same hard checks (bounds, collision, support, stack layers, cumulative top load,
 * payload, unloading blocking). Cartons with no lower gap are then offered the whole
 * container again, lowest space first, so loaded quantity never drops (대표 결정:
 * 내릴 곳이 없으면 남은 공간에 적재).
 */
export function settleSparseTopLayer(
  container: ContainerSpec,
  cargo: CargoItem[],
  input: BeamPackingOutput,
  strategy: LoadingStrategy,
): BeamPackingOutput {
  let placements = input.placements;

  for (let guard = 0; guard < 16; guard += 1) {
    const tiers = levels(placements);
    if (tiers.length < SPARSE_TOP_MIN_LEVELS) break;
    const [topKey, topTier] = tiers[tiers.length - 1];
    const fullest = Math.max(...tiers.map(([, tier]) => tier.length));
    if (topTier.length > fullest * SPARSE_TOP_LAYER_RATIO) break;

    const lifted = new Set(topTier);
    const kept = placements.filter(placement => !lifted.has(placement));
    const keptCounts = new Map<string, number>();
    kept.forEach(p => keptCounts.set(p.cargoId, (keptCounts.get(p.cargoId) ?? 0) + 1));
    const liftedCounts = new Map<string, number>();
    topTier.forEach(p => liftedCounts.set(p.cargoId, (liftedCounts.get(p.cargoId) ?? 0) + 1));
    // Only the lifted cartons may be inserted; everything else keeps its current count.
    const probeCargo = cargo.map(item => ({
      ...item,
      quantity: (keptCounts.get(item.id) ?? 0) + (liftedCounts.get(item.id) ?? 0),
    }));
    const ceiling: ContainerSpec = { ...container, height: topKey / 1000 };
    const refilled = completeResidualPacking(ceiling, probeCargo, {
      placements: kept,
      loadedWeightKg: kept.reduce((sum, p) => sum + p.weightKg, 0),
      usedVolumeM3: kept.reduce((sum, p) => sum + volume(p), 0),
      remaining: [],
    }, strategy);
    const stillLifted = refilled.remaining.some(row => row.quantity > 0);
    placements = stillLifted
      // No lower gap for some cartons: load them in any remaining safe space instead.
      ? completeResidualPacking(container, probeCargo, refilled, strategy).placements
      : refilled.placements;
    // Stop if a carton had to go back up; the tier can no longer be settled lower.
    if (stillLifted) break;
  }

  if (placements === input.placements) return input;
  const before = new Map<string, number>();
  input.placements.forEach(p => before.set(p.cargoId, (before.get(p.cargoId) ?? 0) + 1));
  const after = new Map<string, number>();
  placements.forEach(p => after.set(p.cargoId, (after.get(p.cargoId) ?? 0) + 1));
  // Loaded quantity must never fall; if it would, keep the original arrangement.
  if ([...before].some(([id, count]) => (after.get(id) ?? 0) < count)) return input;
  return {
    ...input,
    placements,
    loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0),
    usedVolumeM3: placements.reduce((sum, p) => sum + volume(p), 0),
  };
}
