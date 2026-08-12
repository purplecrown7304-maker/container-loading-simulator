import { describe, expect, it } from 'vitest';
import { optimizeLoadingShape } from './shapeOptimizer';
import { assessShapeQuality } from './shapeQuality';
import { validatePlacements } from './constraints';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 3, width: 2, height: 2, maxPayloadKg: 1000 };
const item: CargoItem = {
  id: 'A',
  name: 'A',
  length: 0.5,
  width: 0.5,
  height: 0.5,
  weightKg: 10,
  quantity: 4,
  maxStackLayers: 4,
  maxTopLoadKg: 200,
  allowRotation: true,
};

function p(x: number, y: number, z = 0): Placement {
  return { cargoId: 'A', x, y, z, length: 0.5, width: 0.5, height: 0.5, weightKg: 10 };
}

describe('optimizeLoadingShape', () => {
  it('reduces shape penalty without changing cargo count or weight', () => {
    const placements = [
      p(0, 0),
      p(0, 0.5),
      p(0.5, 0),
      // 중앙에 홀로 떨어진 최상단/바닥 박스
      p(1.5, 0.75),
    ];
    const before = assessShapeQuality(container, placements);
    expect(before.isolatedMiddleBoxes).toBeGreaterThan(0);

    const result = optimizeLoadingShape(container, placements, new Map([['A', item]]));
    const after = assessShapeQuality(container, result.placements);

    expect(result.placements).toHaveLength(placements.length);
    expect(result.placements.reduce((sum, box) => sum + box.weightKg, 0)).toBe(40);
    expect(after.shapePenalty).toBeLessThan(before.shapePenalty);
    expect(result.movedCount).toBeGreaterThan(0);
    expect(validatePlacements(container, result.placements)).toEqual([]);
  });

  it('does not move a box that is supporting another box', () => {
    const placements = [p(0, 0, 0), p(0, 0, 0.5), p(1.5, 0.75, 0)];
    const result = optimizeLoadingShape(container, placements, new Map([['A', item]]));
    const baseStillPresent = result.placements.some((box) =>
      Math.abs(box.x) < 1e-9 && Math.abs(box.y) < 1e-9 && Math.abs(box.z) < 1e-9,
    );
    expect(baseStillPresent).toBe(true);
    expect(validatePlacements(container, result.placements)).toEqual([]);
  });
});
