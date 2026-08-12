import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';

const EPS = 1e-9;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function candidateAxes(container: ContainerSpec, placements: Placement[]) {
  const xs = new Set<number>([0]);
  const ys = new Set<number>([0]);
  const zs = new Set<number>([0]);

  for (const placement of placements) {
    xs.add(round3(placement.x + placement.length));
    ys.add(round3(placement.y + placement.width));
    zs.add(round3(placement.z + placement.height));
  }

  return {
    xs: [...xs].filter((value) => value <= container.length + EPS).sort((a, b) => a - b),
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

export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
): Placement | null {
  const axes = candidateAxes(container, placements);
  const itemOrientations = orientations(item);

  // 후보축이 이미 오름차순이므로 안쪽(x) → 낮은 위치(z) → 좌측(y) 순으로
  // 탐색하다 첫 유효 위치를 즉시 반환한다. 기존처럼 모든 후보를 끝까지 훑지 않아
  // 대량 혼합 적재에서 후보축의 3중 조합이 폭증하는 문제를 줄인다.
  for (const x of axes.xs) {
    for (const z of axes.zs) {
      for (const y of axes.ys) {
        for (const orientation of itemOrientations) {
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

          if (!isInsideContainer(container, candidate)) continue;
          if (placements.some((placement) => overlaps(candidate, placement))) continue;
          if (!hasFullSupport(candidate, placements)) continue;
          if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) continue;
          return candidate;
        }
      }
    }
  }

  return null;
}
