import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport } from './support';

const EPS = 1e-9;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

type Orientation = { length: number; width: number; rotated: boolean };

export type MixedPlacementOptions = {
  minX?: number;
  maxX?: number;
  preferDoorSide?: boolean;
  /** DIRECT BOX 잔량에서 같은 x/y 스택을 새 바닥 칸보다 먼저 완성한다. */
  preferVerticalStack?: boolean;
};

function orientations(item: CargoItem): Orientation[] {
  const normal = { length: item.length, width: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) < EPS) return [normal];
  return [normal, { length: item.width, width: item.length, rotated: true }];
}

function xCandidates(
  container: ContainerSpec,
  placements: Placement[],
  orientation: Orientation,
  options: MixedPlacementOptions,
) {
  const minX = Math.max(0, options.minX ?? 0);
  const maxX = Math.min(container.length, options.maxX ?? container.length);
  const values = new Set<number>([round3(minX), round3(Math.max(minX, maxX - orientation.length))]);
  for (const placement of placements) {
    values.add(round3(placement.x));
    values.add(round3(placement.x + placement.length));
    values.add(round3(placement.x - orientation.length));
  }
  return [...values]
    .filter((x) => x + EPS >= minX && x >= -EPS && x + orientation.length <= maxX + EPS)
    .sort((a, b) => options.preferDoorSide ? b - a : a - b);
}

function yCandidates(container: ContainerSpec, placements: Placement[], orientation: Orientation) {
  const values = new Set<number>([0, round3(Math.max(0, container.width - orientation.width))]);
  for (const placement of placements) {
    values.add(round3(placement.y));
    values.add(round3(placement.y + placement.width));
    values.add(round3(placement.y - orientation.width));
  }
  return [...values]
    .filter((y) => y >= -EPS && y + orientation.width <= container.width + EPS)
    .sort((a, b) => a - b);
}

function zCandidates(container: ContainerSpec, item: CargoItem, placements: Placement[]) {
  const values = new Set<number>([0]);
  for (const placement of placements) {
    values.add(round3(placement.z));
    values.add(round3(placement.z + placement.height));
  }
  return [...values]
    .filter((z) => z >= -EPS && z + item.height <= container.height + EPS)
    .sort((a, b) => a - b);
}

function sideContact(a: Placement, b: Placement) {
  const xTouch = Math.abs(a.x + a.length - b.x) <= 0.001 || Math.abs(b.x + b.length - a.x) <= 0.001;
  const yOverlap = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > EPS;
  const zOverlap = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > EPS;
  const yTouch = Math.abs(a.y + a.width - b.y) <= 0.001 || Math.abs(b.y + b.width - a.y) <= 0.001;
  const xOverlap = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > EPS;
  return (xTouch && yOverlap && zOverlap) || (yTouch && xOverlap && zOverlap);
}

function sameStackContinuation(candidate: Placement, placements: Placement[]) {
  if (candidate.z <= EPS) return false;
  return placements.some((other) =>
    other.cargoId === candidate.cargoId
    && Math.abs(other.x - candidate.x) <= 0.001
    && Math.abs(other.y - candidate.y) <= 0.001
    && Math.abs(other.length - candidate.length) <= 0.001
    && Math.abs(other.width - candidate.width) <= 0.001
    && Math.abs(other.z + other.height - candidate.z) <= 0.001,
  );
}

/** 운영 효율 점수: 동일 품목 묶음과 빈틈 감소만 본다. 물리 안정성 벌점은 주지 않는다. */
function compactnessScore(candidate: Placement, placements: Placement[], container: ContainerSpec, preferVerticalStack: boolean) {
  let score = candidate.x * 4 + candidate.y;
  if (candidate.y <= EPS || candidate.y + candidate.width >= container.width - EPS) score -= 0.25;
  let contacts = 0;
  let sameCargoContacts = 0;
  for (const other of placements) {
    if (!sideContact(candidate, other)) continue;
    contacts += 1;
    if (other.cargoId === candidate.cargoId) sameCargoContacts += 1;
  }
  score -= contacts * 0.08 + sameCargoContacts * 0.45;
  if (preferVerticalStack && sameStackContinuation(candidate, placements)) score -= 4;
  return score;
}

function validCandidate(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
  options: MixedPlacementOptions,
  x: number,
  y: number,
  z: number,
  orientation: Orientation,
) {
  const candidate: Placement = {
    cargoId: item.id,
    x,
    y,
    z,
    length: orientation.length,
    width: orientation.width,
    height: item.height,
    weightKg: item.weightKg,
    rotated: orientation.rotated,
  };
  if (candidate.x + candidate.length > (options.maxX ?? container.length) + EPS) return null;
  if (!isInsideContainer(container, candidate)) return null;
  if (placements.some((placement) => overlaps(candidate, placement))) return null;
  if (!hasAdequateSupport(candidate, placements)) return null;
  if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) return null;
  return candidate;
}

export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
  options: MixedPlacementOptions = {},
): Placement | null {
  const itemOrientations = orientations(item);
  const zs = zCandidates(container, item, placements);
  const preferVerticalStack = options.preferVerticalStack === true;
  const allXs = [...new Set(itemOrientations.flatMap((orientation) => xCandidates(container, placements, orientation, options)))]
    .sort((a, b) => options.preferDoorSide ? b - a : a - b);

  if (preferVerticalStack) {
    // 가장 안쪽의 가능한 x를 먼저 고정한다. 그 x 안에서는 동일 SKU의 기존 기둥을
    // 위로 완성하는 후보를 강하게 우선하고, 안 되면 양쪽 박스 경계/벽에 맞춰 빈 폭을 채운다.
    for (const x of allXs) {
      let bestAtX: Placement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const orientation of itemOrientations) {
        if (!xCandidates(container, placements, orientation, options).some((value) => Math.abs(value - x) <= EPS)) continue;
        for (const y of yCandidates(container, placements, orientation)) {
          for (const z of zs) {
            const candidate = validCandidate(container, item, placements, cargoById, options, x, y, z, orientation);
            if (!candidate) continue;
            const score = compactnessScore(candidate, placements, container, true);
            if (score < bestScore) {
              bestAtX = candidate;
              bestScore = score;
            }
          }
        }
      }
      if (bestAtX) return bestAtX;
    }
    return null;
  }

  for (const x of allXs) {
    for (const z of zs) {
      let best: Placement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const orientation of itemOrientations) {
        if (!xCandidates(container, placements, orientation, options).some((value) => Math.abs(value - x) <= EPS)) continue;
        for (const y of yCandidates(container, placements, orientation)) {
          const candidate = validCandidate(container, item, placements, cargoById, options, x, y, z, orientation);
          if (!candidate) continue;
          const score = compactnessScore(candidate, placements, container, false);
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }
      if (best) return best;
    }
  }
  return null;
}
