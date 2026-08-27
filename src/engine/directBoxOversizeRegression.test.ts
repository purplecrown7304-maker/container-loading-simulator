import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 1,
  width: 1,
  height: 1,
  maxPayloadKg: 1000,
};

function cargo(overrides: Partial<CargoItem>): CargoItem {
  return {
    id: 'OVERSIZE',
    name: 'OVERSIZE',
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    quantity: 1,
    maxStackLayers: 2,
    maxTopLoadKg: 100,
    allowRotation: false,
    ...overrides,
  };
}

describe('DIRECT BOX oversize rejection', () => {
  it('returns a box wider than the container as remaining instead of creating an invalid placement', () => {
    const result = loadContainer(container, [cargo({ width: 1.1 })], { strategy: 'capacity', publish: false });

    expect(result.placements).toHaveLength(0);
    expect(result.validationIssues).toEqual([]);
    expect(result.remaining.find((row) => row.cargoId === 'OVERSIZE')?.quantity).toBe(1);
  });

  it('returns a box taller than the container as remaining instead of forcing one layer', () => {
    const result = loadContainer(container, [cargo({ height: 1.1 })], { strategy: 'capacity', publish: false });

    expect(result.placements).toHaveLength(0);
    expect(result.validationIssues).toEqual([]);
    expect(result.remaining.find((row) => row.cargoId === 'OVERSIZE')?.quantity).toBe(1);
  });

  it('returns a box longer than the container as remaining when rotation is disabled', () => {
    const result = loadContainer(container, [cargo({ length: 1.1 })], { strategy: 'capacity', publish: false });

    expect(result.placements).toHaveLength(0);
    expect(result.validationIssues).toEqual([]);
    expect(result.remaining.find((row) => row.cargoId === 'OVERSIZE')?.quantity).toBe(1);
  });
});
