import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const standard20: ContainerSpec = {
  length: 5.9,
  width: 2.352,
  height: 2.395,
  maxPayloadKg: 28130,
  floorLoadLimitKgPerM2: 1500,
};

const box: CargoItem = {
  id: 'REC-570X750X330',
  name: '범용 추천 570×750×330',
  length: 0.57,
  width: 0.75,
  height: 0.33,
  weightKg: 10.2,
  quantity: 80,
  maxStackLayers: 10,
  allowRotation: true,
};

describe('20260916 diagnostic stacking regression', () => {
  it('uses upper layers after the 20FT Standard floor footprint is filled', () => {
    const result = loadContainer(standard20, [box], { strategy: 'capacity', publish: false });
    const floorOnlyCapacity = Math.max(
      Math.floor(standard20.length / box.length) * Math.floor(standard20.width / box.width),
      Math.floor(standard20.length / box.width) * Math.floor(standard20.width / box.length),
    );

    expect(result.placements.length).toBeGreaterThan(floorOnlyCapacity);
    expect(result.placements.some(item => item.z > 0.001)).toBe(true);
    expect(result.validationIssues).toEqual([]);
    expect(Math.max(...result.placements.map(item => item.z + item.height))).toBeLessThanOrEqual(standard20.height + 0.001);
  });
});
