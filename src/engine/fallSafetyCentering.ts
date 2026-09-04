import { centerPlacementsOnContainer } from './containerCentering';
import { filterOperationallyUnsafeShape } from './placementStabilityFilter';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-9;

function moved(a: Placement[], b: Placement[]) {
  if (a.length !== b.length) return true;
  return a.some((placement, index) => {
    const other = b[index];
    return !other || Math.abs(placement.x - other.x) > EPS || Math.abs(placement.y - other.y) > EPS;
  });
}

/**
 * Weight-centering is an optimization preference. Fall / overturn safety is a hard constraint.
 *
 * The input placements must already have passed the operational shape filter. We may translate
 * the whole load toward the container geometric center only when the translated shape remains
 * operationally safe. If centering would turn a wall-supported high stack into an exposed cliff,
 * keep the original safe wall-anchored position instead.
 */
export function centerPlacementsWithFallSafety(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
): Placement[] {
  if (!placements.length) return [];
  const centered = centerPlacementsOnContainer(container, placements);
  if (!moved(placements, centered)) return centered;

  const centeredSafety = filterOperationallyUnsafeShape(container, cargo, centered);
  if (centeredSafety.removedByCargo.size > 0 || centeredSafety.placements.length !== centered.length) {
    return placements.map((placement) => ({ ...placement }));
  }
  return centered;
}
