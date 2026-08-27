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

function supportingAncestorsWithDepth(candidate: Placement, placements: Placement[]) {
  const depthByPlacement = new Map<Placement, number>();
  let frontier = placements
    .filter((placement) => directlySupportedBy(candidate, placement))
    .map((placement) => ({ placement, depth: 2 }));

  while (frontier.length > 0) {
    const next: Array<{ placement: Placement; depth: number }> = [];
    for (const current of frontier) {
      const previous = depthByPlacement.get(current.placement) ?? 0;
      if (previous >= current.depth) continue;
      depthByPlacement.set(current.placement, current.depth);
      for (const possibleLower of placements) {
        if (directlySupportedBy(current.placement, possibleLower)) {
          next.push({ placement: possibleLower, depth: current.depth + 1 });
        }
      }
    }
    frontier = next;
  }

  return depthByPlacement;
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

  // 혼합 SKU 적재에서도 아래 박스의 최대 적층단을 존중한다.
  // 예: 바닥 박스가 최대 2단이면, 다른 SKU를 위에 얹어 3단 체인을 만드는 것도 금지한다.
  for (const [base, resultingDepth] of supportingAncestorsWithDepth(candidate, placements)) {
    const baseItem = cargoById.get(base.cargoId);
    if (baseItem?.maxStackLayers !== undefined && resultingDepth > baseItem.maxStackLayers) return false;
  }

  for (const base of placements) {
    const baseItem = cargoById.get(base.cargoId);
    if (baseItem?.maxTopLoadKg === undefined) continue;

    const projected = projectedTopLoadKg(base, candidate, placements);
    if (projected > baseItem.maxTopLoadKg + EPSILON) return false;
  }

  return true;
}
