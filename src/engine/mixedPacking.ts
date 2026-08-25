import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport } from './support';

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

/** 운영 효율 점수: 동일 품목 묶음과 빈틈 감소만 본다. 물리 안정성 벌점은 주지 않는다. */
function compactnessScore(candidate: Placement, placements: Placement[], container: ContainerSpec) {
  let score = candidate.y;
  if (candidate.y <= EPS || candidate.y + candidate.width >= container.width - EPS) score -= 0.25;
  let contacts = 0;
  let sameCargoContacts = 0;
  for (const other of placements) {
    if (!sideContact(candidate, other)) continue;
    contacts += 1;
    if (other.cargoId === candidate.cargoId) sameCargoContacts += 1;
  }
  score -= contacts * 0.08 + sameCargoContacts * 0.45;
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
          if (!hasAdequateSupport(candidate, placements)) continue;
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
