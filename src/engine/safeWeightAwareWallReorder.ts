import { validatePlacements } from './constraints';
import type { ContainerSpec, Placement } from './types';
import { rebalanceStrictWallPlacements } from './weightAwareWallReorder';

const EPS = 1e-7;

function horizontalDeviation(placements: Placement[]) {
  if (!placements.length) return 0;
  const totalWeight = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  if (totalWeight <= EPS) return 0;

  const minX = Math.min(...placements.map(item => item.x));
  const maxX = Math.max(...placements.map(item => item.x + item.length));
  const minY = Math.min(...placements.map(item => item.y));
  const maxY = Math.max(...placements.map(item => item.y + item.width));
  const spanX = Math.max(EPS, maxX - minX);
  const spanY = Math.max(EPS, maxY - minY);
  const targetX = (minX + maxX) / 2;
  const targetY = (minY + maxY) / 2;

  const cogX = placements.reduce(
    (sum, item) => sum + (item.x + item.length / 2) * item.weightKg,
    0,
  ) / totalWeight;
  const cogY = placements.reduce(
    (sum, item) => sum + (item.y + item.width / 2) * item.weightKg,
    0,
  ) / totalWeight;

  return Math.hypot(
    (cogX - targetX) / spanX,
    (cogY - targetY) / spanY,
  );
}

/**
 * Weight-aware wall reorder is an optimization layer, never a safety authority.
 * If it creates any boundary/collision issue or worsens the aggregate horizontal
 * center-of-gravity deviation, the original StrictWallPacker result wins.
 */
export function safelyRebalanceStrictWallPlacements(
  container: ContainerSpec,
  placements: Placement[],
): Placement[] {
  if (placements.length < 2) return placements;

  const before = horizontalDeviation(placements);
  const candidate = rebalanceStrictWallPlacements(container, placements);
  if (candidate === placements) return placements;
  if (validatePlacements(container, candidate).length > 0) return placements;

  const after = horizontalDeviation(candidate);
  return after <= before + EPS ? candidate : placements;
}
