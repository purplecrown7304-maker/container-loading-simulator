const EPS = 1e-6;

/**
 * Margin taken off the top and bottom of every simulated cuboid. Bodies start slightly lifted
 * and settle under gravity, which closes this margin before any inertial force is applied.
 */
export const COLLIDER_VERTICAL_MARGIN_M = 0.0005;

/**
 * Rapier half extents for a planned cuboid (carton, pallet, void-fill support).
 *
 * The footprint is the planned length and width, unchanged: neighbours that touch in the plan
 * touch in the simulation, so horizontal travel is limited by the gaps the plan really has.
 * A margin on the sides would leave a gap between every pair of neighbours. Nothing closes
 * those gaps before the force is applied, so across a row of narrow cartons they add up and
 * the whole block leans into travel the plan does not contain.
 */
export function colliderHalfExtents(item: { length: number; width: number; height: number }) {
  return {
    halfLength: Math.max(EPS, item.length / 2),
    halfHeight: Math.max(EPS, item.height / 2 - COLLIDER_VERTICAL_MARGIN_M),
    halfWidth: Math.max(EPS, item.width / 2),
  };
}
