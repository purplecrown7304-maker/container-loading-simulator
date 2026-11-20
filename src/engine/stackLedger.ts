import { candidateIndexes, createFootprintGrid, type FootprintGrid } from './footprintGrid';
import { CONTACT_TOLERANCE_M, supportContactArea } from './support';
import type { CargoItem, Placement } from './types';

/** The tolerance `stacking.ts` allows on a transmitted load. */
const TOP_LOAD_TOLERANCE_KG = 0.001;

export type StackLedger = ReturnType<typeof createStackLedger>;

/**
 * The contact graph of cartons laid from the floor up, kept as each carton is added.
 *
 * It answers the stacking rules of `stacking.ts` for the next carton without walking every
 * carton again, and with the same meaning: the stack depth is counted through every carton
 * that carries the candidate, and a carton carries the whole weight of every carton that
 * stands on it directly or through others, each counted once. Cartons must be added lowest
 * first, so that a carton never gains a supporter after it was added.
 *
 * It replaces no check: the plan is still audited as a whole with `stacking.ts` afterwards.
 */
export function createStackLedger(cargoById: Map<string, CargoItem>, bounds: { minX: number; minY: number; maxX: number; maxY: number; cell?: number }) {
  const items: Placement[] = [];
  const below: number[][] = [];
  const carriedKg: number[] = [];
  let grid: FootprintGrid | null = createFootprintGrid([], bounds);
  const near = (p: Placement) => candidateIndexes(grid, items.length, p.x, p.y, p.x + p.length, p.y + p.width);

  /** `supportingAncestorsWithDepth` of stacking.ts: every carton under the candidate and its deepest level. */
  const ancestorDepths = (direct: number[]) => {
    const depthOf = new Map<number, number>();
    let frontier: Array<[number, number]> = direct.map(i => [i, 2]);
    while (frontier.length) {
      const next: Array<[number, number]> = [];
      for (const [i, depth] of frontier) {
        if ((depthOf.get(i) ?? 0) >= depth) continue;
        depthOf.set(i, depth);
        for (const j of below[i]) next.push([j, depth + 1]);
      }
      frontier = next;
    }
    return depthOf;
  };
  /** `countStackLayersBelow` of stacking.ts. */
  const layersWith = (p: Placement, direct: number[]) => {
    if (p.z <= CONTACT_TOLERANCE_M) return 1;
    let depth = 1, frontier = direct;
    const visited = new Set<number>();
    while (frontier.length) {
      depth += 1;
      const next: number[] = [];
      for (const i of frontier) { if (visited.has(i)) continue; visited.add(i); for (const j of below[i]) next.push(j); }
      frontier = next;
    }
    return depth;
  };
  const insert = (p: Placement, direct: number[], ancestors: Iterable<number>) => {
    for (const i of ancestors) carriedKg[i] += p.weightKg;
    if (grid && !grid.insert(items.length, p)) grid = null;
    items.push(p); below.push(direct); carriedKg.push(0);
  };

  return {
    /** The cartons added so far, in the order they were added. */
    items,
    /**
     * A carton about to be added: the cartons whose footprint may touch its own (enough for
     * overlap, support and floor load), the tier it would stand in, whether
     * `canPlaceByStackingRules` allows it, and `add` to add it.
     */
    examine(item: CargoItem, p: Placement) {
      const indexes = near(p);
      const direct = indexes.filter(i => supportContactArea(items[i], p) > 0);
      const depths = ancestorDepths(direct);
      const layers = layersWith(p, direct);
      const maxLayers = item.strengthUnverified ? Math.min(1, item.maxStackLayers ?? 1) : item.maxStackLayers;
      let allowed = maxLayers === undefined || layers <= maxLayers;
      if (allowed) for (const [i, depth] of depths) {
        const base = items[i], baseItem = cargoById.get(base.cargoId);
        if (baseItem?.strengthUnverified || (baseItem?.maxStackLayers !== undefined && depth > baseItem.maxStackLayers)) { allowed = false; break; }
        if (baseItem?.maxTopLoadKg === undefined && baseItem?.maxTopPressureKgPerM2 === undefined) continue;
        const projected = carriedKg[i] + p.weightKg;
        if ((baseItem.maxTopLoadKg !== undefined && projected > baseItem.maxTopLoadKg + TOP_LOAD_TOLERANCE_KG)
          || (baseItem.maxTopPressureKgPerM2 !== undefined && projected > baseItem.maxTopPressureKgPerM2 * base.length * base.width + TOP_LOAD_TOLERANCE_KG)) { allowed = false; break; }
      }
      return { touching: indexes.map(i => items[i]), layers, allowed, add: () => insert(p, direct, depths.keys()) };
    },
    add(p: Placement) {
      const direct = near(p).filter(i => supportContactArea(items[i], p) > 0);
      insert(p, direct, ancestorDepths(direct).keys());
    },
  };
}
