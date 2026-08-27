import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 1,
  width: 0.5,
  height: 1,
  maxPayloadKg: 1000,
};

function cargo(id: string): CargoItem {
  return {
    id,
    name: id,
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    quantity: 2,
    maxStackLayers: 2,
    maxTopLoadKg: 100,
    allowRotation: false,
  };
}

describe('DIRECT BOX deterministic SKU priority', () => {
  it('uses cargo code as the final tie-break regardless of input row order', () => {
    const result = loadContainer(container, [cargo('B-SKU'), cargo('A-SKU')], {
      strategy: 'capacity',
      publish: false,
    });

    expect(result.validationIssues).toEqual([]);
    expect(result.placements).toHaveLength(4);

    const aMinX = Math.min(...result.placements.filter((p) => p.cargoId === 'A-SKU').map((p) => p.x));
    const bMinX = Math.min(...result.placements.filter((p) => p.cargoId === 'B-SKU').map((p) => p.x));

    expect(aMinX).toBeCloseTo(0, 6);
    expect(bMinX).toBeCloseTo(0.5, 6);
    expect(aMinX).toBeLessThan(bMinX);
  });
});
