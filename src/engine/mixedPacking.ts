import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport } from './support';

const EPS = 1e-9;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

type Orientation = { length: number; width: number; rotated: boolean };

/**
 * @deprecated DIRECT BOX 자동적재는 이 옵션/헬퍼를 사용하지 않는다.
 * 옛 호출부의 타입 호환만 유지한다. preferDoorSide / preferVerticalStack은
 * 기존의 문쪽-tail/세로스택 동작을 되살리지 않기 위해 의도적으로 무시한다.
 */
export type MixedPlacementOptions = {
  minX?: number;
  maxX?: number;
  preferDoorSide?: boolean;
  preferVerticalStack?: boolean;
};

function orientations(item: CargoItem): Orientation[] {
  const normal = { length: item.length, width: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) <= EPS) return [normal];
  return [normal, { length: item.width, width: item.length, rotated: true }];
}

function candidateAxes(
  container: ContainerSpec,
  item: CargoItem,
  orientation: Orientation,
  placements: Placement[],
  options: MixedPlacementOptions,
) {
  const minX = Math.max(0, options.minX ?? 0);
  const maxX = Math.min(container.length, options.maxX ?? container.length);
  const xs = new Set<number>([minX, Math.max(minX, maxX - orientation.length)]);
  const ys = new Set<number>([0, Math.max(0, container.width - orientation.width)]);
  const zs = new Set<number>([0]);

  for (const p of placements) {
    xs.add(p.x);
    xs.add(p.x + p.length);
    xs.add(p.x - orientation.length);
    ys.add(p.y);
    ys.add(p.y + p.width);
    ys.add(p.y - orientation.width);
    zs.add(p.z + p.height);
  }

  return {
    xs: [...xs].map(round6).filter((x) => x + EPS >= minX && x >= -EPS && x + orientation.length <= maxX + EPS),
    ys: [...ys].map(round6).filter((y) => y >= -EPS && y + orientation.width <= container.width + EPS),
    zs: [...zs].map(round6).filter((z) => z >= -EPS && z + item.height <= container.height + EPS),
  };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function contactScore(candidate: Placement, placements: Placement[], container: ContainerSpec) {
  const floorArea = candidate.length * candidate.width;
  let contact = candidate.z <= EPS ? floorArea : 0;
  if (candidate.x <= EPS || candidate.x + candidate.length >= container.length - EPS) contact += candidate.width * candidate.height;
  if (candidate.y <= EPS || candidate.y + candidate.width >= container.width - EPS) contact += candidate.length * candidate.height;

  for (const p of placements) {
    const xOverlap = overlap1d(candidate.x, candidate.x + candidate.length, p.x, p.x + p.length);
    const yOverlap = overlap1d(candidate.y, candidate.y + candidate.width, p.y, p.y + p.width);
    const zOverlap = overlap1d(candidate.z, candidate.z + candidate.height, p.z, p.z + p.height);
    if (Math.abs(candidate.z - (p.z + p.height)) <= 0.001) contact += xOverlap * yOverlap;
    if (Math.abs(candidate.x - (p.x + p.length)) <= 0.001 || Math.abs(p.x - (candidate.x + candidate.length)) <= 0.001) contact += yOverlap * zOverlap;
    if (Math.abs(candidate.y - (p.y + p.width)) <= 0.001 || Math.abs(p.y - (candidate.y + candidate.width)) <= 0.001) contact += xOverlap * zOverlap;
  }
  return contact;
}

function scoreCandidate(candidate: Placement, placements: Placement[], container: ContainerSpec) {
  const xCenter = (candidate.x + candidate.length / 2) / Math.max(EPS, container.length);
  const yCenter = (candidate.y + candidate.width / 2) / Math.max(EPS, container.width);
  const zCenter = (candidate.z + candidate.height / 2) / Math.max(EPS, container.height);
  const contact = contactScore(candidate, placements, container);

  // 호환 호출에서도 옛 "문쪽 먼저" 또는 "기존 기둥부터 완성" 규칙은 사용하지 않는다.
  // 낮은 위치, 안쪽부터의 작업 진행, 넓은 접촉, 좌우 중앙성을 일반적인 안전/작업성 점수로만 평가한다.
  return zCenter * 120 + xCenter * 7 + Math.abs(yCenter - 0.5) * 5 - contact * 10;
}

function validCandidate(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
  x: number,
  y: number,
  z: number,
  orientation: Orientation,
): Placement | null {
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
  if (!isInsideContainer(container, candidate)) return null;
  if (placements.some((p) => overlaps(candidate, p))) return null;
  if (!hasAdequateSupport(candidate, placements)) return null;
  if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) return null;
  return candidate;
}

/**
 * @deprecated 새 DIRECT BOX 엔진은 blockSpaceBeamPacker의
 * Homogeneous Block -> Maximal Empty Space -> Beam Search를 사용한다.
 * 이 함수는 과거 모듈을 import하는 보조 UI/유틸의 빌드 호환용이며,
 * 옛 door-tail / vertical-stack 우선순위는 완전히 제거되어 있다.
 */
export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
  options: MixedPlacementOptions = {},
): Placement | null {
  let best: Placement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const orientation of orientations(item)) {
    const axes = candidateAxes(container, item, orientation, placements, options);
    for (const z of axes.zs) for (const x of axes.xs) for (const y of axes.ys) {
      const candidate = validCandidate(container, item, placements, cargoById, x, y, z, orientation);
      if (!candidate) continue;
      const score = scoreCandidate(candidate, placements, container);
      if (score < bestScore - EPS) {
        best = candidate;
        bestScore = score;
      } else if (Math.abs(score - bestScore) <= EPS && best) {
        const key = `${candidate.z}:${candidate.x}:${candidate.y}:${candidate.rotated ? 1 : 0}`;
        const bestKey = `${best.z}:${best.x}:${best.y}:${best.rotated ? 1 : 0}`;
        if (key.localeCompare(bestKey) < 0) best = candidate;
      }
    }
  }

  return best;
}
