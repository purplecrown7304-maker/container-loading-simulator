import { describe, expect, it } from 'vitest';
import { optimizeZoneHeightShape } from './zoneHeightOptimizer';
import { assessZoneUtilization } from './zoneUtilization';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 3, width: 1, height: 2, maxPayloadKg: 5000 };
const item: CargoItem = {
  id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5, weightKg: 10,
  quantity: 20, maxStackLayers: 4, maxTopLoadKg: 1000, allowRotation: true,
};

function p(x: number, y: number, z: number): Placement {
  return { cargoId: 'A', x, y, z, length: 0.5, width: 0.5, height: 0.5, weightKg: 10, rotated: false };
}

describe('zone height optimizer', () => {
  it('reduces a middle-zone spike when a safe lower destination exists', () => {
    const placements: Placement[] = [
      p(0, 0, 0), p(0, 0.5, 0),
      p(1, 0, 0), p(1, 0.5, 0),
      p(1, 0, 0.5), p(1, 0, 1), p(1, 0, 1.5),
    ];
    const before = assessZoneUtilization(container, placements);
    const result = optimizeZoneHeightShape(container, placements, new Map([[item.id, item]]));
    const after = assessZoneUtilization(container, result.placements);
    const middleBefore = before.find(z => z.id === 'middle')!;
    const middleAfter = after.find(z => z.id === 'middle')!;

    expect(result.movedCount).toBeGreaterThan(0);
    expect(result.afterSpikeScore).toBeLessThan(result.beforeSpikeScore);
    expect(middleAfter.maxHeightM).toBeLessThanOrEqual(middleBefore.maxHeightM);
    expect(result.placements).toHaveLength(placements.length);
  });

  it('does nothing when there is no meaningful middle spike', () => {
    const placements: Placement[] = [p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)];
    const result = optimizeZoneHeightShape(container, placements, new Map([[item.id, item]]));
    expect(result.movedCount).toBe(0);
    expect(result.placements).toEqual(placements);
  });

  it('never moves a box that supports another box', () => {
    const placements: Placement[] = [
      p(0, 0, 0),
      p(1, 0, 0), p(1, 0, 0.5), p(1, 0, 1), p(1, 0, 1.5),
    ];
    const result = optimizeZoneHeightShape(container, placements, new Map([[item.id, item]]));
    const baseStillExists = result.placements.some(current => current.x === 1 && current.y === 0 && current.z === 0);
    expect(baseStillExists).toBe(true);
  });
});
