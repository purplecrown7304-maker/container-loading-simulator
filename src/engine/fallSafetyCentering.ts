import { centerPlacementsOnContainer } from './containerCentering';
import { filterOperationallyUnsafeShape } from './placementStabilityFilter';
import type { CargoItem, ContainerSpec, Placement } from './types';

const MAX_PASSES = 12;

export type FallSafeCenteringResult = {
  placements: Placement[];
  removedByCargo: Map<string, number>;
};

function addRemoved(target: Map<string, number>, source: Map<string, number>) {
  for (const [cargoId, quantity] of source) {
    target.set(cargoId, (target.get(cargoId) ?? 0) + quantity);
  }
}

/**
 * The horizontal target is always the container geometric center:
 * x = container.length / 2, y = container.width / 2.
 *
 * Cargo CG is only measured to determine the translation error. It is never used as
 * the target point. Fall / overturn prevention remains a hard constraint, but an
 * unsafe centering attempt no longer sends the whole arrangement back to the inner
 * wall. Instead we keep the container-center target, remove only newly exposed unsafe
 * top boxes, and re-center the remaining safe arrangement. This repeats until the
 * centered shape is safe or the deterministic pass limit is reached.
 */
export function centerPlacementsWithFallSafety(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
): FallSafeCenteringResult {
  if (!placements.length) return { placements: [], removedByCargo: new Map() };

  let current = placements.map((placement) => ({ ...placement }));
  const removedByCargo = new Map<string, number>();

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const centered = centerPlacementsOnContainer(container, current);
    const safety = filterOperationallyUnsafeShape(container, cargo, centered);
    addRemoved(removedByCargo, safety.removedByCargo);

    if (safety.placements.length === centered.length && safety.removedByCargo.size === 0) {
      return { placements: centered, removedByCargo };
    }

    if (!safety.placements.length) {
      return { placements: [], removedByCargo };
    }

    current = safety.placements;
  }

  // The last filter result is already fall-safe. Do not perform one more unvalidated
  // translation after the pass limit; returning it preserves the hard safety rule.
  return { placements: current, removedByCargo };
}
