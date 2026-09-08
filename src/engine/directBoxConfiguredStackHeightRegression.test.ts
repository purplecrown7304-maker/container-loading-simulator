import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 4,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 100000,
};

function virtualCargo(maxTopLoadKg?: number): CargoItem {
  return {
    id: 'VIRTUAL-15',
    name: '가상 화물 15',
    length: 0.8,
    width: 0.46,
    height: 0.39,
    weightKg: 64,
    quantity: 150,
    maxStackLayers: 7,
    maxTopLoadKg,
    allowRotation: false,
  };
}

function layerOf(placement: Placement) {
  return Math.round(placement.z / placement.height) + 1;
}

describe('DIRECT BOX configured stack height regression', () => {
  it('uses six layers for a 390mm box in a 2690mm container when maxStackLayers is seven', () => {
    const cargo = virtualCargo();
    const result = loadContainer(container, [cargo], { strategy: 'capacity', publish: false });
    const maxLayer = Math.max(0, ...result.placements.map(layerOf));
    const maxTop = Math.max(0, ...result.placements.map(item => item.z + item.height));

    expect(result.validationIssues).toEqual([]);
    expect(maxLayer).toBe(6);
    expect(maxTop).toBeCloseTo(2.34, 6);
    expect(maxTop).toBeLessThanOrEqual(container.height);
    expect(result.placements.some(item => layerOf(item) === 6)).toBe(true);
  });

  it('still respects an explicitly configured cumulative top-load limit', () => {
    const cargo = virtualCargo(128);
    const result = loadContainer(container, [cargo], { strategy: 'capacity', publish: false });
    const maxLayer = Math.max(0, ...result.placements.map(layerOf));

    expect(result.validationIssues).toEqual([]);
    expect(maxLayer).toBeLessThanOrEqual(3);
  });
});
