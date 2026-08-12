import type { CargoItem, Placement } from './types';

const EPSILON = 0.001;

function overlapArea(a: Placement, b: Placement): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y),
  );
  return xOverlap * yOverlap;
}

function directlySupports(lower: Placement, upper: Placement): boolean {
  const lowerTop = lower.z + lower.height;
  if (Math.abs(lowerTop - upper.z) > EPSILON) return false;
  return overlapArea(lower, upper) > EPSILON;
}

function directlySupportedBy(upper: Placement, lower: Placement): boolean {
  return directlySupports(lower, upper);
}

export function countStackLayersBelow(
  candidate: Placement,
  placements: Placement[],
): number {
  if (candidate.z <= EPSILON) return 1;

  let depth = 1;
  let frontier = placements.filter((placement) => directlySupportedBy(candidate, placement));
  const visited = new Set<Placement>();

  while (frontier.length > 0) {
    depth += 1;
    const next: Placement[] = [];

    for (const placement of frontier) {
      if (visited.has(placement)) continue;
      visited.add(placement);
      for (const possibleLower of placements) {
        if (directlySupportedBy(placement, possibleLower)) next.push(possibleLower);
      }
    }

    frontier = next;
  }

  return depth;
}

export function projectedTopLoadKg(
  base: Placement,
  candidate: Placement,
  placements: Placement[],
): number {
  const above = [...placements, candidate].filter(
    (placement) => placement !== base && placement.z >= base.z + base.height - EPSILON,
  );

  let total = 0;
  const queue = above.filter((placement) => directlySupports(base, placement));
  const visited = new Set<Placement>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    total += current.weightKg;

    for (const possibleUpper of above) {
      if (possibleUpper === current || visited.has(possibleUpper)) continue;
      if (directlySupports(current, possibleUpper)) queue.push(possibleUpper);
    }
  }

  return total;
}

export function canPlaceByStackingRules(
  item: CargoItem,
  candidate: Placement,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
): boolean {
  if (item.maxStackLayers !== undefined) {
    const resultingLayer = countStackLayersBelow(candidate, placements);
    if (resultingLayer > item.maxStackLayers) return false;
  }

  for (const base of placements) {
    const baseItem = cargoById.get(base.cargoId);
    if (baseItem?.maxTopLoadKg === undefined) continue;

    const projected = projectedTopLoadKg(base, candidate, placements);
    if (projected > baseItem.maxTopLoadKg + EPSILON) return false;
  }

  return true;
}
