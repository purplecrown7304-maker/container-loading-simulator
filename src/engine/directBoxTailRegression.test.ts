import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 2,
  width: 1,
  height: 1,
  maxPayloadKg: 5000,
};

const cargo: CargoItem = {
  id: 'RAGGED',
  name: 'RAGGED',
  length: 0.5,
  width: 0.5,
  height: 0.5,
  weightKg: 10,
  quantity: 5,
  maxStackLayers: 2,
  maxTopLoadKg: 100,
  allowRotation: false,
};

describe('direct-box deferred tail-zone regression', () => {
  it('keeps the incomplete same-SKU remainder behind the completed pure slice', () => {
    const result = loadContainer(container, [cargo], { strategy: 'capacity', publish: false });

    const pureSlice = result.placements.filter((placement) => Math.abs(placement.x) < 1e-9);
    const deferredTail = result.placements.filter((placement) => placement.x >= 0.5 - 1e-9);

    expect(pureSlice).toHaveLength(4);
    expect(deferredTail).toHaveLength(1);
    expect(deferredTail[0]?.cargoId).toBe('RAGGED');
    expect(deferredTail[0]?.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(result.remaining).toHaveLength(0);
    expect(result.validationIssues).toEqual([]);
  });
});
