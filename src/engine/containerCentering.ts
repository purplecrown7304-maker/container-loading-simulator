import type { ContainerSpec, Placement } from './types';

const EPS = 1e-9;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function horizontalCenterOfGravity(placements: Placement[]) {
  const totalWeightKg = placements.reduce((sum, placement) => sum + Math.max(0, placement.weightKg), 0);
  if (totalWeightKg <= EPS) return null;
  return {
    x: placements.reduce((sum, placement) => sum + (placement.x + placement.length / 2) * Math.max(0, placement.weightKg), 0) / totalWeightKg,
    y: placements.reduce((sum, placement) => sum + (placement.y + placement.width / 2) * Math.max(0, placement.weightKg), 0) / totalWeightKg,
  };
}

/**
 * Moves the complete loaded arrangement as one rigid group so its horizontal
 * center of gravity is as close as possible to the container geometric center.
 *
 * A rigid X/Y translation preserves every relative support, stacking, collision,
 * and height relationship. The movement is clamped by the container walls, so
 * no box can be shifted outside the container. Z is intentionally unchanged:
 * vertical stability still prefers a low center of gravity rather than the
 * geometric mid-height of the container.
 */
export function centerPlacementsOnContainer(
  container: ContainerSpec,
  placements: Placement[],
): Placement[] {
  if (!placements.length) return [];

  const cog = horizontalCenterOfGravity(placements);
  if (!cog) return placements.map((placement) => ({ ...placement }));

  const minX = Math.min(...placements.map((placement) => placement.x));
  const maxX = Math.max(...placements.map((placement) => placement.x + placement.length));
  const minY = Math.min(...placements.map((placement) => placement.y));
  const maxY = Math.max(...placements.map((placement) => placement.y + placement.width));

  const desiredDx = container.length / 2 - cog.x;
  const desiredDy = container.width / 2 - cog.y;
  const dx = clamp(desiredDx, -minX, container.length - maxX);
  const dy = clamp(desiredDy, -minY, container.width - maxY);

  if (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS) {
    return placements.map((placement) => ({ ...placement }));
  }

  return placements.map((placement) => ({
    ...placement,
    x: round6(placement.x + dx),
    y: round6(placement.y + dy),
  }));
}
