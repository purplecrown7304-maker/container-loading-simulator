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
  it('keeps the final arrangement deterministic regardless of input row order', () => {
    const first = loadContainer(container, [cargo('B-SKU'), cargo('A-SKU')], {
      strategy: 'capacity',
      publish: false,
    });
    const second = loadContainer(container, [cargo('A-SKU'), cargo('B-SKU')], {
      strategy: 'capacity',
      publish: false,
    });

    const normalized = (result: ReturnType<typeof loadContainer>) => [...result.placements]
      .map((placement) => ({
        cargoId: placement.cargoId,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        length: placement.length,
        width: placement.width,
        height: placement.height,
        rotated: Boolean(placement.rotated),
      }))
      .sort((a, b) => a.cargoId.localeCompare(b.cargoId) || a.z - b.z || a.x - b.x || a.y - b.y);

    expect(first.validationIssues).toEqual([]);
    expect(second.validationIssues).toEqual([]);
    expect(first.placements).toHaveLength(4);
    expect(second.placements).toHaveLength(4);
    expect(first.placements.filter((placement) => placement.cargoId === 'A-SKU')).toHaveLength(2);
    expect(first.placements.filter((placement) => placement.cargoId === 'B-SKU')).toHaveLength(2);
    expect(normalized(first)).toEqual(normalized(second));
  });
});
