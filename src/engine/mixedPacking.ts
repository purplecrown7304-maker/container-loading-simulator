import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';

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

    const xOverlap = Math.max(
      0,
      Math.min(candidate.x + candidate.length, placement.x + placement.length) -
        Math.max(candidate.x, placement.x),
    );
    const yOverlap = Math.max(
      0,
      Math.min(candidate.y + candidate.width, placement.y + placement.width) -
        Math.max(candidate.y, placement.y),
    );

    return xOverlap > 0 && yOverlap > 0;
  });

  const supportedArea = supporting.reduce((sum, placement) => {
    const xOverlap = Math.max(
      0,
      Math.min(candidate.x + candidate.length, placement.x + placement.length) -
        Math.max(candidate.x, placement.x),
    );
    const yOverlap = Math.max(
      0,
      Math.min(candidate.y + candidate.width, placement.y + placement.width) -
        Math.max(candidate.y, placement.y),
    );
    return sum + xOverlap * yOverlap;
  }, 0);

  return supportedArea + 1e-9 >= candidate.length * candidate.width;
}

export function findMixedPlacement(
  container: ContainerSpec,
  item: CargoItem,
  placements: Placement[],
): Placement | null {
  const axes = candidateAxes(container, placements);

  for (const x of axes.xs) {
    for (const z of axes.zs) {
      for (const y of axes.ys) {
        const candidate: Placement = {
          cargoId: item.id,
          x,
          y,
          z,
          length: item.length,
          width: item.width,
          height: item.height,
          weightKg: item.weightKg,
        };

        if (!isInsideContainer(container, candidate)) continue;
        if (placements.some((placement) => overlaps(candidate, placement))) continue;
        if (!hasFullSupport(candidate, placements)) continue;

        return candidate;
      }
    }
  }

  return null;
}
