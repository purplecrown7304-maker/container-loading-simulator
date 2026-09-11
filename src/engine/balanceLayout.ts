import type { ContainerSpec, Placement } from './types';

const EPS = 1e-9;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function weightedCenter(placements: Placement[]) {
  const totalWeight = placements.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0);
  if (totalWeight <= EPS) {
    const count = Math.max(1, placements.length);
    return {
      x: placements.reduce((sum, item) => sum + item.x + item.length / 2, 0) / count,
      y: placements.reduce((sum, item) => sum + item.y + item.width / 2, 0) / count,
    };
  }

  return {
    x: placements.reduce((sum, item) => sum + (item.x + item.length / 2) * Math.max(0, item.weightKg), 0) / totalWeight,
    y: placements.reduce((sum, item) => sum + (item.y + item.width / 2) * Math.max(0, item.weightKg), 0) / totalWeight,
  };
}

/**
 * Moves an already-safe packing plan as one rigid group toward the container mass center.
 * Relative box positions never change, so collision, support, stacking and compression
 * relationships are preserved. Translation is clamped to the container boundaries.
 */
export function centerPackedLayout(container: ContainerSpec, placements: Placement[]): Placement[] {
  if (!placements.length) return placements;

  const minX = Math.min(...placements.map(item => item.x));
  const maxX = Math.max(...placements.map(item => item.x + item.length));
  const minY = Math.min(...placements.map(item => item.y));
  const maxY = Math.max(...placements.map(item => item.y + item.width));
  const center = weightedCenter(placements);

  const desiredDx = container.length / 2 - center.x;
  const desiredDy = container.width / 2 - center.y;
  const dx = clamp(desiredDx, -minX, container.length - maxX);
  const dy = clamp(desiredDy, -minY, container.width - maxY);

  if (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS) return placements;
  return placements.map(item => ({
    ...item,
    x: round6(item.x + dx),
    y: round6(item.y + dy),
  }));
}
