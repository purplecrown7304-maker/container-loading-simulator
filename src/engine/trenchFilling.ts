import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport } from './support';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-4;
const overlap1d = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

type Stack = {
  key: string;
  x: number;
  y: number;
  length: number;
  width: number;
  top: number;
  topBox: Placement;
};

function stacksOf(placements: Placement[]): Stack[] {
  const map = new Map<string, Stack>();
  for (const p of placements) {
    const key = `${p.x.toFixed(4)}:${p.y.toFixed(4)}:${p.length.toFixed(4)}:${p.width.toFixed(4)}`;
    const top = p.z + p.height;
    const current = map.get(key);
    if (!current || top > current.top) map.set(key, { key, x: p.x, y: p.y, length: p.length, width: p.width, top, topBox: p });
  }
  return [...map.values()];
}

/** Highest neighbouring top on one side of the stack along one axis (0 when that side is open). */
function sideHeight(stack: Stack, all: Stack[], axis: 'x' | 'y', side: -1 | 1) {
  let best = -1;
  for (const other of all) {
    if (other === stack) continue;
    if (axis === 'x') {
      const touches = side < 0 ? near(other.x + other.length, stack.x) : near(other.x, stack.x + stack.length);
      if (!touches || overlap1d(stack.y, stack.y + stack.width, other.y, other.y + other.width) < stack.width * 0.5) continue;
    } else {
      const touches = side < 0 ? near(other.y + other.width, stack.y) : near(other.y, stack.y + stack.width);
      if (!touches || overlap1d(stack.x, stack.x + stack.length, other.x, other.x + other.length) < stack.length * 0.5) continue;
    }
    best = Math.max(best, other.top);
  }
  return best;
}

/** Depth of the pit a stack sits in: how far both walls on some axis rise above it. */
function pitDepth(stack: Stack, all: Stack[]) {
  let depth = 0;
  for (const axis of ['x', 'y'] as const) {
    const low = sideHeight(stack, all, axis, -1);
    const high = sideHeight(stack, all, axis, 1);
    if (low < 0 || high < 0) continue;
    depth = Math.max(depth, Math.min(low, high) - stack.top);
  }
  return depth;
}

function peakness(stack: Stack, all: Stack[]) {
  const sides = (['x', 'y'] as const).flatMap(axis => [sideHeight(stack, all, axis, -1), sideHeight(stack, all, axis, 1)]).filter(h => h >= 0);
  if (!sides.length) return stack.top;
  return stack.top - sides.reduce((sum, h) => sum + h, 0) / sides.length;
}

/**
 * Conservative local unloading check for one carton at its new position: it may not sit in
 * front of (door side, +X) or on top of an earlier stop, and no later stop may sit in front of
 * or on top of it. Removing the donor can only clear blocking, so the plan never gets worse.
 */
function blocksUnloading(candidate: Placement, others: Placement[], stopOf: (id: string) => number | undefined) {
  const stop = stopOf(candidate.cargoId);
  if (stop == null) return false;
  return others.some(other => {
    const otherStop = stopOf(other.cargoId);
    if (otherStop == null || otherStop === stop) return false;
    const y = overlap1d(candidate.y, candidate.y + candidate.width, other.y, other.y + other.width) > EPS;
    if (!y) return false;
    const x = overlap1d(candidate.x, candidate.x + candidate.length, other.x, other.x + other.length) > EPS;
    const z = overlap1d(candidate.z, candidate.z + candidate.height, other.z, other.z + other.height) > EPS;
    const [earlier, later] = otherStop < stop ? [other, candidate] : [candidate, other];
    return (z && later.x >= earlier.x + earlier.length - EPS) || (x && later.z >= earlier.z + earlier.height - EPS);
  });
}

/**
 * Fast necessary condition before the full cumulative top-load check: walking down the
 * exactly aligned column under the candidate, each carton must still carry everything above
 * it plus the candidate within its declared top-load limit. Rejecting here is only ever
 * stricter than the full check, never looser.
 */
function alignedColumnOverloaded(candidate: Placement, placements: Placement[], byId: Map<string, CargoItem>) {
  let carried = candidate.weightKg;
  let z = candidate.z;
  const column = placements.filter(p => near(p.x, candidate.x) && near(p.y, candidate.y) && near(p.length, candidate.length) && near(p.width, candidate.width) && p.z < candidate.z);
  column.sort((a, b) => b.z - a.z);
  for (const base of column) {
    if (!near(base.z + base.height, z)) break;
    const limit = byId.get(base.cargoId)?.maxTopLoadKg;
    const above = placements.filter(p => p !== base && p.z >= base.z + base.height - EPS && near(p.x, base.x) && near(p.y, base.y) && near(p.length, base.length) && near(p.width, base.width))
      .reduce((sum, p) => sum + p.weightKg, 0);
    if (limit != null && above + carried > limit + EPS) return true;
    carried = 0;
    z = base.z;
  }
  return false;
}

function hasSomethingAbove(box: Placement, placements: Placement[]) {
  const top = box.z + box.height;
  return placements.some(p => p !== box && near(p.z, top)
    && overlap1d(box.x, box.x + box.length, p.x, p.x + p.length) > EPS
    && overlap1d(box.y, box.y + box.width, p.y, p.y + p.width) > EPS);
}

/**
 * Unloading-order layouts build one block per stop. A small stop between two tall stop
 * walls ends up as a one-carton-wide trench: a few cartons on the floor with tall walls on
 * both sides, which leaves a deep narrow void that can't be braced in transport.
 *
 * This pass lifts cartons off the highest peaks and drops them into those trenches, one at a
 * time. A move is accepted only if every hard check passes (bounds, collision, full support,
 * stack layers, cumulative top load), the moved carton neither blocks nor is blocked by another stop, and the
 * donor stays strictly higher than the filled trench, so the surface always gets flatter and
 * the loop terminates. The carton set and counts never change.
 */
export function fillUnloadingTrenches(container: ContainerSpec, cargo: CargoItem[], input: Placement[]): Placement[] {
  if (input.length < 3) return input;
  const byId = new Map(cargo.map(item => [item.id, item]));
  const stopOf = (id: string) => byId.get(id)?.unloadPriority;
  let placements = [...input];
  // A trench no donor could fill is not retried; later moves only lower peaks elsewhere.
  const exhausted = new Set<string>();

  for (let guard = 0; guard < input.length; guard += 1) {
    const stacks = stacksOf(placements);
    const pits = stacks
      .map(stack => ({ stack, depth: pitDepth(stack, stacks) }))
      .filter(entry => entry.depth >= entry.stack.topBox.height - EPS)
      .sort((a, b) => b.depth - a.depth || a.stack.top - b.stack.top || a.stack.x - b.stack.x || a.stack.y - b.stack.y);
    if (!pits.length) break;

    const donors = stacks
      .filter(stack => !hasSomethingAbove(stack.topBox, placements))
      .map(stack => ({ stack, peak: peakness(stack, stacks) }))
      .sort((a, b) => b.peak - a.peak || b.stack.top - a.stack.top || b.stack.x - a.stack.x || a.stack.y - b.stack.y);

    let moved = false;
    for (const { stack: pit } of pits) {
      const pitId = `${pit.key}@${pit.top.toFixed(4)}`;
      if (exhausted.has(pitId)) continue;
      const base = pit.topBox;
      for (const { stack: donorStack } of donors) {
        if (donorStack === pit) continue;
        const donor = donorStack.topBox;
        if (!near(donor.height, base.height)) continue;
        // Donor must stay strictly above the filled trench so the top surface gets flatter.
        if (donorStack.top <= pit.top + donor.height + EPS) continue;
        const item = byId.get(donor.cargoId);
        if (!item) continue;
        const sameFootprint = near(donor.length, pit.length) && near(donor.width, pit.width);
        const rotatedFootprint = item.allowRotation !== false && near(donor.length, pit.width) && near(donor.width, pit.length);
        if (!sameFootprint && !rotatedFootprint) continue;
        const candidate: Placement = {
          ...donor,
          x: pit.x,
          y: pit.y,
          z: pit.top,
          length: pit.length,
          width: pit.width,
          rotated: sameFootprint ? donor.rotated : !donor.rotated,
        };
        const others = placements.filter(p => p !== donor);
        if (!isInsideContainer(container, candidate) || others.some(p => overlaps(candidate, p))) continue;
        if (blocksUnloading(candidate, others, stopOf)) continue;
        if (!hasAdequateSupport(candidate, others, undefined, 0.999)) continue;
        if (alignedColumnOverloaded(candidate, others, byId)) continue;
        if (!canPlaceByStackingRules(item, candidate, others, byId)) continue;
        placements = [...others, candidate];
        moved = true;
        break;
      }
      if (moved) break;
      exhausted.add(pitId);
    }
    if (!moved) break;
  }
  return placements;
}
