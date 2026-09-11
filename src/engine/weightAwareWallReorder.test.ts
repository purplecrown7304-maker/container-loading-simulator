import { describe, expect, it } from 'vitest';
import { validatePlacements } from './constraints';
import { rebalanceStrictWallPlacements } from './weightAwareWallReorder';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 4,
  width: 2,
  height: 1,
  maxPayloadKg: 10000,
};

function horizontalCog(placements: Placement[]) {
  const total = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  return {
    x: placements.reduce((sum, placement) => sum + (placement.x + placement.length / 2) * placement.weightKg, 0) / total,
    y: placements.reduce((sum, placement) => sum + (placement.y + placement.width / 2) * placement.weightKg, 0) / total,
  };
}

function targetDistance(placements: Placement[]) {
  const cog = horizontalCog(placements);
  return Math.hypot(cog.x - container.length / 2, cog.y - container.width / 2);
}

describe('rebalanceStrictWallPlacements', () => {
  it('moves a heavy full-width wall toward the center even when the total footprint already fills the container', () => {
    const placements: Placement[] = [];
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 2; y += 1) {
        placements.push({
          cargoId: x === 0 ? 'HEAVY' : 'LIGHT',
          x,
          y,
          z: 0,
          length: 1,
          width: 1,
          height: 1,
          weightKg: x === 0 ? 100 : 10,
          rotated: false,
        });
      }
    }

    const before = targetDistance(placements);
    const result = rebalanceStrictWallPlacements(container, placements);
    const after = targetDistance(result);

    expect(Math.min(...result.map(item => item.x))).toBeCloseTo(0, 6);
    expect(Math.max(...result.map(item => item.x + item.length))).toBeCloseTo(container.length, 6);
    expect(validatePlacements(container, result)).toEqual([]);
    expect(after).toBeLessThan(before * 0.5);
  });

  it('keeps a crossed boundary intact so stacked/support geometry is not split apart', () => {
    const placements: Placement[] = [
      { cargoId: 'BASE-L', x: 0, y: 0, z: 0, length: 1, width: 1, height: 0.5, weightKg: 10 },
      { cargoId: 'BASE-R', x: 1, y: 0, z: 0, length: 1, width: 1, height: 0.5, weightKg: 10 },
      // This top box crosses x=1, so x=1 must not become a movable cut.
      { cargoId: 'TOP', x: 0.5, y: 0, z: 0.5, length: 1, width: 1, height: 0.5, weightKg: 100 },
    ];

    const result = rebalanceStrictWallPlacements(container, placements);
    const top = result.find(item => item.cargoId === 'TOP');
    const left = result.find(item => item.cargoId === 'BASE-L');
    const right = result.find(item => item.cargoId === 'BASE-R');

    expect(top?.x).toBe(0.5);
    expect(left?.x).toBe(0);
    expect(right?.x).toBe(1);
  });
});
