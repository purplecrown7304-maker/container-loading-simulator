import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 0.57,
  width: 0.75,
  height: 3.3,
  maxPayloadKg: 1000,
  floorLoadLimitKgPerM2: 5000,
};

const cargo: CargoItem = {
  id: 'STACK-10',
  name: '10단 허용 박스',
  length: 0.57,
  width: 0.75,
  height: 0.33,
  weightKg: 10,
  quantity: 10,
  maxStackLayers: 10,
  allowRotation: false,
};

describe('explicit maxStackLayers loading', () => {
  it('uses vertical space instead of treating a 10-layer box as floor-only', () => {
    const result = loadContainer(container, [cargo], { strategy: 'capacity', publish: false });
    expect(result.remaining).toEqual([]);
    expect(result.placements).toHaveLength(10);
    expect(Math.max(...result.placements.map(item => item.z))).toBeGreaterThan(0);
    expect(Math.max(...result.placements.map(item => item.z + item.height))).toBeCloseTo(3.3, 5);
  });
});
