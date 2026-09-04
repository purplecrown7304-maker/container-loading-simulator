import { describe, expect, it } from 'vitest';
import { centerPlacementsOnContainer } from './containerCentering';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 6,
  width: 2.4,
  height: 2.6,
  maxPayloadKg: 20000,
};

function weightedCog(placements: Placement[]) {
  const total = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  return {
    x: placements.reduce((sum, placement) => sum + (placement.x + placement.length / 2) * placement.weightKg, 0) / total,
    y: placements.reduce((sum, placement) => sum + (placement.y + placement.width / 2) * placement.weightKg, 0) / total,
  };
}

describe('centerPlacementsOnContainer', () => {
  it('centers a partial direct-box load on the fixed container X/Y center', () => {
    const placements: Placement[] = [
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 0.8, height: 1, weightKg: 100 },
      { cargoId: 'B', x: 1, y: 0, z: 0, length: 1, width: 0.8, height: 1, weightKg: 100 },
    ];

    const centered = centerPlacementsOnContainer(container, placements);
    const cog = weightedCog(centered);

    expect(cog.x).toBeCloseTo(container.length / 2, 6);
    expect(cog.y).toBeCloseTo(container.width / 2, 6);
    expect(centered[1].x - centered[0].x).toBeCloseTo(1, 6);
    expect(centered[0].z).toBe(0);
  });

  it('uses weight, not the occupied footprint midpoint, as the centering target', () => {
    const placements: Placement[] = [
      { cargoId: 'HEAVY', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 300 },
      { cargoId: 'LIGHT', x: 1, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
    ];

    const centered = centerPlacementsOnContainer(container, placements);
    const cog = weightedCog(centered);
    const footprintCenterX = (
      Math.min(...centered.map((placement) => placement.x)) +
      Math.max(...centered.map((placement) => placement.x + placement.length))
    ) / 2;

    expect(cog.x).toBeCloseTo(container.length / 2, 6);
    expect(cog.y).toBeCloseTo(container.width / 2, 6);
    expect(footprintCenterX).not.toBeCloseTo(container.length / 2, 3);
  });

  it('clamps movement at container walls when exact CG centering is physically impossible', () => {
    const placements: Placement[] = [
      { cargoId: 'HEAVY', x: 0, y: 0, z: 0, length: 3, width: 2.4, height: 1, weightKg: 900 },
      { cargoId: 'LIGHT', x: 3, y: 0, z: 0, length: 3, width: 2.4, height: 1, weightKg: 100 },
    ];

    const centered = centerPlacementsOnContainer(container, placements);

    expect(Math.min(...centered.map((placement) => placement.x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...centered.map((placement) => placement.x + placement.length))).toBeLessThanOrEqual(container.length + 1e-9);
    expect(Math.min(...centered.map((placement) => placement.y))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...centered.map((placement) => placement.y + placement.width))).toBeLessThanOrEqual(container.width + 1e-9);
  });
});
