import { validatePlacements } from './constraints';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-7;
type Slice = {
  start: number;
  end: number;
  indexes: number[];
  dominantSku: string;
  unloadRank: number;
  weightKg: number;
};

function slicesOf(placements: Placement[], cargo: CargoItem[]): Slice[] {
  if (placements.length < 1) return [];
  const min = Math.min(...placements.map(item => item.x));
  const max = Math.max(...placements.map(item => item.x + item.length));
  const boundaries = [...new Set(placements.flatMap(item => [item.x, item.x + item.length]).map(value => Math.round(value * 1e6) / 1e6))]
    .filter(value => value > min + EPS && value < max - EPS)
    .sort((a, b) => a - b)
    .filter(cut => !placements.some(item => item.x < cut - EPS && item.x + item.length > cut + EPS));
  const points = [min, ...boundaries, max];
  const priority = new Map(cargo.map(item => [item.id, Number.isFinite(item.unloadPriority) ? item.unloadPriority as number : 0]));
  const slices: Slice[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i], end = points[i + 1];
    const indexes = placements.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.x >= start - EPS && item.x + item.length <= end + EPS)
      .map(({ index }) => index);
    if (!indexes.length) return [];
    const weights = new Map<string, number>();
    let totalWeight = 0, unloadMoment = 0;
    for (const index of indexes) {
      const item = placements[index];
      weights.set(item.cargoId, (weights.get(item.cargoId) ?? 0) + item.weightKg);
      totalWeight += item.weightKg;
      unloadMoment += (priority.get(item.cargoId) ?? 0) * item.weightKg;
    }
    const dominantSku = [...weights.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
    slices.push({ start, end, indexes, dominantSku, unloadRank: totalWeight > EPS ? unloadMoment / totalWeight : 0, weightKg: totalWeight });
  }
  const assigned = slices.flatMap(slice => slice.indexes);
  return assigned.length === placements.length && new Set(assigned).size === placements.length ? slices : [];
}

function rearrange(container: ContainerSpec, placements: Placement[], ordered: Slice[]) {
  if (ordered.length < 2) return placements;
  const base = Math.min(...ordered.map(slice => slice.start));
  const shift = new Map<number, number>();
  let cursor = base;
  for (const slice of ordered) {
    const delta = cursor - slice.start;
    slice.indexes.forEach(index => shift.set(index, delta));
    cursor += slice.end - slice.start;
  }
  const next = placements.map((item, index) => {
    const delta = shift.get(index) ?? 0;
    return Math.abs(delta) <= EPS ? item : { ...item, x: Math.round((item.x + delta) * 1e6) / 1e6 };
  });
  return validatePlacements(container, next).length ? placements : next;
}

/** Later unloadPriority belongs deeper (x=0); priority 1 therefore stays nearer the door. */
export function reorderForUnloading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const slices = slicesOf(placements, cargo);
  if (slices.length < 2 || !cargo.some(item => Number.isFinite(item.unloadPriority))) return placements;
  return rearrange(container, placements, [...slices].sort((a, b) => b.unloadRank - a.unloadRank || a.start - b.start));
}

/** Keeps each safe rigid wall intact but makes walls dominated by the same SKU consecutive. */
export function reorderForSkuGrouping(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const slices = slicesOf(placements, cargo);
  if (slices.length < 2) return placements;
  const firstOrder = new Map<string, number>();
  slices.forEach((slice, index) => { if (!firstOrder.has(slice.dominantSku)) firstOrder.set(slice.dominantSku, index); });
  return rearrange(container, placements, [...slices].sort((a, b) =>
    (firstOrder.get(a.dominantSku) ?? 0) - (firstOrder.get(b.dominantSku) ?? 0) || a.start - b.start,
  ));
}

/**
 * When the operational rule is simply "heavy cargo first", move heavier rigid walls toward
 * the inside (x=0). Relative stacking/support inside every wall is untouched.
 */
export function reorderHeavyWallsInside(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const slices = slicesOf(placements, cargo);
  if (slices.length < 2) return placements;
  return rearrange(container, placements, [...slices].sort((a, b) => b.weightKg - a.weightKg || a.start - b.start));
}

/**
 * Center each independently movable X wall in the lateral direction. Walls do not overlap
 * in X, so their Y translation cannot create inter-wall collisions. Each wall moves as one
 * rigid body, preserving every vertical support/stacking relationship.
 */
export function centerSafeWallsLaterally(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const slices = slicesOf(placements, cargo);
  if (!slices.length) return placements;
  const shifts = new Map<number, number>();

  for (const slice of slices) {
    const members = slice.indexes.map(index => placements[index]);
    const minY = Math.min(...members.map(item => item.y));
    const maxY = Math.max(...members.map(item => item.y + item.width));
    const totalWeight = members.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0);
    const cogY = totalWeight > EPS
      ? members.reduce((sum, item) => sum + (item.y + item.width / 2) * Math.max(0, item.weightKg), 0) / totalWeight
      : (minY + maxY) / 2;
    const desired = container.width / 2 - cogY;
    const delta = Math.min(container.width - maxY, Math.max(-minY, desired));
    slice.indexes.forEach(index => shifts.set(index, delta));
  }

  const next = placements.map((item, index) => {
    const delta = shifts.get(index) ?? 0;
    return Math.abs(delta) <= EPS ? item : { ...item, y: Math.round((item.y + delta) * 1e6) / 1e6 };
  });
  return validatePlacements(container, next).length ? placements : next;
}
