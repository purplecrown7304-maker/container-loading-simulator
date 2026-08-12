import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';

const EPS = 1e-9;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export type MixedPlacementOptions = {
  minX?: number;
  maxX?: number;
  preferDoorSide?: boolean;
};

function candidateAxes(container: ContainerSpec, placements: Placement[], options: MixedPlacementOptions = {}) {
  const xs = new Set<number>([0, options.minX ?? 0]);
  const ys = new Set<number>([0]);
  const zs = new Set<number>([0]);
  for (const placement of placements) {
    xs.add(round3(placement.x + placement.length));
    ys.add(round3(placement.y + placement.width));
    zs.add(round3(placement.z + placement.height));
  }
  const minX = Math.max(0, options.minX ?? 0);
  const maxX = Math.min(container.length, options.maxX ?? container.length);
  const filteredX = [...xs]
    .filter((value) => value + EPS >= minX && value <= maxX + EPS)
    .sort((a, b) => options.preferDoorSide ? b - a : a - b);
  return {
    xs: filteredX,
    ys: [...ys].filter((value) => value <= container.width + EPS).sort((a, b) => a - b),
    zs: [...zs].filter((value) => value <= container.height + EPS).sort((a, b) => a - b),
  };
}

function hasFullSupport(candidate: Placement, placements: Placement[]): boolean {
  if (Math.abs(candidate.z) <= 0.001) return true;
  let supportedArea = 0;
  for (const placement of placements) {
    const top = round3(placement.z + placement.height);
    if (Math.abs(top - candidate.z) > 0.001) continue;
    const xOverlap = Math.max(0, Math.min(candidate.x + candidate.length, placement.x + placement.length) - Math.max(candidate.x, placement.x));
    if (xOverlap <= 0) continue;
    const yOverlap = Math.max(0, Math.min(candidate.y + candidate.width, placement.y + placement.width) - Math.max(candidate.y, placement.y));
    if (yOverlap <= 0) continue;
    supportedArea += xOverlap * yOverlap;
    if (supportedArea + EPS >= candidate.length * candidate.width) return true;
  }
  return false;
}

function orientations(item: CargoItem) {
  const normal = { length: item.length, width: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) < EPS) return [normal];
  return [normal, { length: item.width, width: item.length, rotated: true }];
}

function sideContact(a: Placement, b: Placement) {
  const xTouch = Math.abs(a.x + a.length - b.x) <= 0.001 || Math.abs(b.x + b.length - a.x) <= 0.001;
  const yOverlap = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > EPS;
  const zOverlap = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > EPS;
  const yTouch = Math.abs(a.y + a.width - b.y) <= 0.001 || Math.abs(b.y + b.width - a.y) <= 0.001;
  const xOverlap = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > EPS;
  return (xTouch && yOverlap && zOverlap) || (yTouch && xOverlap && zOverlap);
}

function compactnessScore(candidate: Placement, placements: Placement[], container: ContainerSpec) {
  let score = candidate.y;
  if (candidate.y <= EPS || candidate.y + candidate.width >= container.width - EPS) score -= 0.35;
  let contacts = 0;
  let sameCargoContacts = 0;
  for (const other of placements) {
    if (!sideContact(candidate, other)) continue;
    contacts += 1;
    if (other.cargoId === candidate.cargoId) sameCargoContacts += 1;
  }
  score -= contacts * 0.12 + sameCargoContacts * 0.45;
  const centerY = candidate.y + candidate.width / 2;
  if (contacts === 0 && centerY > container.width * 0.28 && centerY < container.width * 0.72) score += 2;
  return score;
}

export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
  options: MixedPlacementOptions = {},
): Placement | null {
  const axes = candidateAxes(container, placements, options);
  const itemOrientations = orientations(item);

  // 기본은 안쪽(x) → 낮은 위치(z) 우선이다. 후처리에서는 minX/preferDoorSide로
  // 문쪽 혼합 구역만 탐색할 수 있다. 같은 x/z 평면에서는 동일 품목과 붙고
  // 벽/기존 블록에 밀착되는 방향을 우선한다.
  for (const x of axes.xs) {
    for (const z of axes.zs) {
      let best: Placement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const y of axes.ys) {
        for (const orientation of itemOrientations) {
          const candidate: Placement = { cargoId: item.id, x, y, z, length: orientation.length, width: orientation.width, height: item.height, weightKg: item.weightKg, rotated: orientation.rotated };
          if (candidate.x + candidate.length > (options.maxX ?? container.length) + EPS) continue;
          if (!isInsideContainer(container, candidate)) continue;
          if (placements.some((placement) => overlaps(candidate, placement))) continue;
          if (!hasFullSupport(candidate, placements)) continue;
          if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) continue;
          const score = compactnessScore(candidate, placements, container);
          if (score < bestScore) { best = candidate; bestScore = score; }
        }
      }
      if (best) return best;
    }
  }
  return null;
}
