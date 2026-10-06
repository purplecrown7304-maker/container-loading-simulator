import { centerPlacementsOnContainer } from './containerCentering';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-8;

/** Opt in with the configured floor limit; absent limits retain legacy coordinates. */
export function usesLongitudinalBalancing(container: ContainerSpec) {
  return !container.rules && Number.isFinite(container.floorLoadLimitKgPerM2)
    && (container.floorLoadLimitKgPerM2 ?? 0) > 0;
}

export function longitudinalMetrics(container: ContainerSpec, placements: Placement[]) {
  const weight = placements.reduce((s, p) => s + p.weightKg, 0);
  if (weight <= 0) return { deviation: 0, halfRatio: 0.5 };
  const moment = placements.reduce((s, p) => s + (p.x + p.length / 2) * p.weightKg, 0);
  const inner = placements.reduce((s, p) => s + (p.x + p.length / 2 <= container.length / 2 ? p.weightKg : 0), 0) / weight;
  return { deviation: Math.abs(moment / weight - container.length / 2) / container.length, halfRatio: Math.max(inner, 1 - inner) };
}

/**
 * Cut only at X planes which do not cross ANY carton. Each connected interval is
 * translated rigidly: every positive-area support/contact and compression chain
 * remains in the same group. No rotation, vertical change, or carton removal.
 */
export function balanceLongitudinalWalls(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]): Placement[] {
  if (!usesLongitudinalBalancing(container) || placements.length < 2) return placements;
  // Cross-stop permutations may change accessibility. Keep the existing unload plan.
  if (new Set(cargo.map(p => p.unloadPriority ?? 0)).size > 1) return placements;
  type Wall = { start: number; end: number; entries: Array<{ p: Placement; index: number }>; weight: number; moment: number };
  const walls: Wall[] = [];
  for (const entry of placements.map((p, index) => ({ p, index })).sort((a, b) => a.p.x - b.p.x || a.index - b.index)) {
    const last = walls.at(-1);
    if (last && entry.p.x < last.end - EPS) {
      last.end = Math.max(last.end, entry.p.x + entry.p.length);
      last.entries.push(entry);
    } else walls.push({ start: entry.p.x, end: entry.p.x + entry.p.length, entries: [entry], weight: 0, moment: 0 });
  }
  if (walls.length < 2) return placements;
  for (const wall of walls) for (const { p } of wall.entries) {
    wall.weight += p.weightKg;
    wall.moment += (p.x - wall.start + p.length / 2) * p.weightKg;
  }
  const totalWeight = walls.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) return placements;
  const render = (order: Wall[]) => {
    let x = 0;
    const moved = new Array<Placement>(placements.length);
    for (const wall of order) {
      for (const { p, index } of wall.entries) moved[index] = { ...p, x: p.x - wall.start + x };
      x += wall.end - wall.start;
    }
    return centerPlacementsOnContainer(container, moved);
  };
  const objective = (ps: Placement[]) => {
    const m = longitudinalMetrics(container, ps);
    return m.deviation + Math.max(0, m.halfRatio - 0.5);
  };
  // Evaluate wall aggregates, materializing individual cartons only after a pass wins.
  const orderScore = (order: Wall[]) => {
    let end = 0, moment = 0;
    for (const wall of order) {
      moment += wall.moment + end * wall.weight;
      end += wall.end - wall.start;
    }
    const dx = Math.max(0, Math.min(container.length - end, container.length / 2 - moment / totalWeight));
    const deviation = Math.abs(moment / totalWeight + dx - container.length / 2) / container.length;
    let x = dx, innerWeight = 0;
    for (const wall of order) {
      const width = wall.end - wall.start;
      if (x + width <= container.length / 2) innerWeight += wall.weight;
      else if (x <= container.length / 2) for (const { p } of wall.entries) {
        if (x + p.x - wall.start + p.length / 2 <= container.length / 2) innerWeight += p.weightKg;
      }
      x += width;
    }
    return deviation + Math.abs(innerWeight / totalWeight - 0.5);
  };
  let order = walls;
  let best = centerPlacementsOnContainer(container, placements);
  let score = objective(best);
  // Input-bounded local search, never a device-dependent time budget.
  for (let pass = 0; pass < Math.min(walls.length, 8); pass++) {
    let nextOrder = order;
    let nextScore = score;
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const swapped = [...order];
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      const value = orderScore(swapped);
      if (value < nextScore - EPS) { nextScore = value; nextOrder = swapped; }
    }
    if (nextOrder === order) break;
    const candidate = render(nextOrder);
    const actualScore = objective(candidate);
    if (actualScore >= score - EPS) break;
    order = nextOrder; best = candidate; score = actualScore;
  }
  return best;
}
