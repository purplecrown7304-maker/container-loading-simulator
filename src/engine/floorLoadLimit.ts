import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import { createFootprintGrid, FOOTPRINT_GRID_MIN_ITEMS } from './footprintGrid';
const EPS = 1e-9;
export const FLOOR_LOAD_REASON = '바닥 허용하중(kg/m²) 초과 · 투영 국부하중을 만족하는 위치 부족';
export function configuredFloorLoadLimit(container: ContainerSpec) {
  const limit = container.floorLoadLimitKgPerM2;
  return limit != null && Number.isFinite(limit) && limit > 0 ? limit : undefined;
}
export function floorLoadLayerCap(container: ContainerSpec, item: CargoItem) {
  const limit = configuredFloorLoadLimit(container);
  if (limit === undefined) return Infinity;
  return Math.max(0, Math.floor((limit * item.length * item.width + EPS) / item.weightKg));
}
/** Exact piecewise-constant vertical projection density. No floor exception or
 * averaging across an unloaded part of a larger footprint is permitted. */
export function withinFloorLoadLimit(container: ContainerSpec, candidate: Placement, placements: Placement[]) {
  const limit = configuredFloorLoadLimit(container);
  if (limit === undefined) return true;
  const density = candidate.weightKg / (candidate.length * candidate.width);
  if (!Number.isFinite(density) || density > limit + EPS) return false;
  const rects = placements.flatMap(p => {
    const x0 = Math.max(candidate.x, p.x), x1 = Math.min(candidate.x + candidate.length, p.x + p.length);
    const y0 = Math.max(candidate.y, p.y), y1 = Math.min(candidate.y + candidate.width, p.y + p.width);
    return x1 - x0 > EPS && y1 - y0 > EPS ? [{ x0, x1, y0, y1, density: p.weightKg / (p.length * p.width) }] : [];
  });
  const xs = [...new Set(rects.flatMap(r => [r.x0, r.x1]))].sort((a,b) => a-b);
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i-1] <= EPS) continue;
    const middle = (xs[i] + xs[i-1]) / 2;
    const events = rects.filter(r => r.x0 < middle && r.x1 > middle)
      .flatMap(r => [{ y: r.y0, delta: r.density }, { y: r.y1, delta: -r.density }])
      .sort((a,b) => a.y-b.y);
    let sum = density;
    for (let j = 0; j < events.length;) {
      const y = events[j].y;
      do { sum += events[j++].delta; } while (j < events.length && events[j].y === y);
      if (j < events.length && events[j].y - y > EPS && sum > limit + EPS) return false;
    }
  }
  return true;
}
/** Classify a floor rejection only where a physically admissible slot exists. */
export function floorLoadBlocksRemaining(container: ContainerSpec, item: CargoItem, placements: Placement[], cargoById: Map<string, CargoItem>) {
  if (configuredFloorLoadLimit(container) === undefined) return false;
  if (floorLoadLayerCap(container, item) === 0) return true;
  if (item.floorOnly || item.maxStackLayers === 1) return false;
  for (const lower of placements) for (const rotated of item.allowRotation === false ? [false] : [false,true]) {
    const p: Placement = { cargoId:item.id, x:lower.x, y:lower.y, z:lower.z+lower.height,
      length:rotated?item.width:item.length, width:rotated?item.length:item.width, height:item.height, weightKg:item.weightKg, rotated };
    if (isInsideContainer(container,p) && !placements.some(q=>overlaps(p,q)) && hasAdequateSupport(p,placements)
      && !withinFloorLoadLimit(container,p,placements) && canPlaceByStackingRules(item,p,placements,cargoById)) return true;
  }
  return false;
}

export function placementsWithinFloorLoadLimit(container: ContainerSpec, placements: Placement[]) {
  if (configuredFloorLoadLimit(container) === undefined) return true;
  // Only staged boxes whose footprint overlaps the candidate add projected load. The grid hands
  // them over in staging order, so the density sums run in the same order as the full scan.
  const grid = placements.length >= FOOTPRINT_GRID_MIN_ITEMS
    ? createFootprintGrid([], { minX: 0, minY: 0, maxX: container.length, maxY: container.width })
    : null;
  let indexed = grid !== null;
  const staged: Placement[] = [];
  for (const placement of placements) {
    const near = indexed ? grid!.query(placement.x, placement.y, placement.x + placement.length, placement.y + placement.width) : null;
    if (!withinFloorLoadLimit(container, placement, near ? near.map(index => staged[index]) : staged)) return false;
    if (indexed && !grid!.insert(staged.length, placement)) indexed = false;
    staged.push(placement);
  }
  return true;
}
