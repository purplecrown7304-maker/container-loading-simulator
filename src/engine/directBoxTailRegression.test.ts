import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 5000 };

const wide: CargoItem = {
  id: 'WIDE', name: 'WIDE', length: 1, width: 0.6, height: 1,
  weightKg: 10, quantity: 1, maxStackLayers: 1, maxTopLoadKg: 100, allowRotation: false,
};
const narrow: CargoItem = {
  id: 'NARROW', name: 'NARROW', length: 1, width: 0.4, height: 1,
  weightKg: 8, quantity: 1, maxStackLayers: 1, maxTopLoadKg: 100, allowRotation: false,
};

describe('direct-box residual maximal-empty-space regression', () => {
  it('allows residual cargo to reuse a safe inner gap instead of pushing it toward the door', () => {
    const result = loadContainer(container, [wide, narrow], { strategy: 'capacity', publish: false });
    expect(result.placements).toHaveLength(2);
    expect(result.remaining).toEqual([]);
    expect(result.placements.every((p) => Math.abs(p.x) < 1e-9)).toBe(true);
    const occupiedWidth = result.placements.reduce((sum, p) => sum + p.width, 0);
    expect(occupiedWidth).toBeCloseTo(1, 9);
    expect(result.validationIssues).toEqual([]);
  });
});
