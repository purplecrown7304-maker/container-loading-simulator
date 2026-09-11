import { describe, expect, it } from 'vitest';
import { centerPackedLayout } from './balanceLayout';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };

function centerOfMass(placements: Placement[]) {
  const total = placements.reduce((sum, item) => sum + item.weightKg, 0);
  return {
    x: placements.reduce((sum, item) => sum + (item.x + item.length / 2) * item.weightKg, 0) / total,
    y: placements.reduce((sum, item) => sum + (item.y + item.width / 2) * item.weightKg, 0) / total,
  };
}

describe('centerPackedLayout', () => {
  it('moves a partial rigid load toward the container center without changing relative geometry', () => {
    const placements: Placement[] = [
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 100, rotated: false },
      { cargoId: 'B', x: 1, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 100, rotated: false },
    ];

    const centered = centerPackedLayout(container, placements);
    const cog = centerOfMass(centered);

    expect(cog.x).toBeCloseTo(container.length / 2, 6);
    expect(cog.y).toBeCloseTo(container.width / 2, 6);
    expect(centered[1].x - centered[0].x).toBeCloseTo(1, 6);
    expect(centered.every(item => item.x >= 0 && item.y >= 0)).toBe(true);
    expect(centered.every(item => item.x + item.length <= container.length && item.y + item.width <= container.width)).toBe(true);
  });

  it('does not force a shift when a full-span load cannot move', () => {
    const placements: Placement[] = [
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 4, width: 2, height: 1, weightKg: 100, rotated: false },
    ];
    expect(centerPackedLayout(container, placements)).toEqual(placements);
  });
});
