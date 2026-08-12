import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';

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
    xs: [...xs].filter((value) => value <= container.length).sort((a, b) => a - b),
    ys: [...ys].filter((value) => value <= container.width).sort((a, b) => a - b),
    zs: [...zs].filter((value) => value <= container.height).sort((a, b) => a - b),
  };
}

function hasFullSupport(candidate: Placement, placements: Placement[]): boolean {
  if (candidate.z === 0) return true;

  const supporting = placements.filter((placement) => {
    const top = round3(placement.z + placement.height);
    if (Math.abs(top - candidate.z) > 0.001) return false;

    const xOverlap = Math.max(0, Math.min(candidate.x + candidate.length, placement.x + placement.length) - Math.max(candidate.x, placement.x));
    const yOverlap = Math.max(0, Math.min(candidate.y + candidate.width, placement.y + placement.width) - Math.max(candidate.y, placement.y));
    return xOverlap > 0 && yOverlap > 0;
  });

  const supportedArea = supporting.reduce((sum, placement) => {
    const xOverlap = Math.max(0, Math.min(candidate.x + candidate.length, placement.x + placement.length) - Math.max(candidate.x, placement.x));
    const yOverlap = Math.max(0, Math.min(candidate.y + candidate.width, placement.y + placement.width) - Math.max(candidate.y, placement.y));
    return sum + xOverlap * yOverlap;
  }, 0);

  return supportedArea + 1e-9 >= candidate.length * candidate.width;
}

function orientations(item: CargoItem) {
  const normal = { length: item.length, width: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) < 1e-9) return [normal];
  return [normal, { length: item.width, width: item.length, rotated: true }];
}

export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
  cargoById: Map<string, CargoItem>,
): Placement | null {
  const axes = candidateAxes(container, placements);
  let best: Placement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const orientation of orientations(item)) {
    for (const x of axes.xs) {
      for (const z of axes.zs) {
        for (const y of axes.ys) {
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

          // 안쪽(x 작음), 낮은 위치(z 작음), 좌측부터(y 작음)를 우선하되
          // 회전으로 더 앞쪽/낮은 빈 공간을 채울 수 있으면 회전 배치를 선택한다.
          const score = x * 10000 + z * 100 + y;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }
  }

  return best;
}
