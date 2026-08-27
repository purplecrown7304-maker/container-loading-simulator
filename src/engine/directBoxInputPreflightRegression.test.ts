import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 3, width: 1, height: 1, maxPayloadKg: 1000 };
const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A',
  name: 'A',
  length: 0.5,
  width: 0.5,
  height: 0.5,
  weightKg: 10,
  quantity: 1,
  maxStackLayers: 1,
  allowRotation: false,
  ...overrides,
});

describe('direct-box input preflight regression', () => {
  it('merges repeated rows for the same SKU when physical specs match', () => {
    const result = loadContainer(container, [box({ quantity: 1 }), box({ quantity: 2 })], { strategy: 'capacity', publish: false });
    expect(result.placements.filter((p) => p.cargoId === 'A')).toHaveLength(3);
    expect(result.remaining).toEqual([]);
    expect(result.validationIssues).toEqual([]);
  });

  it('rejects a conflicting duplicate SKU instead of letting the last row overwrite stacking metadata', () => {
    const result = loadContainer(container, [box({ quantity: 2 }), box({ width: 0.6, quantity: 3 })], { strategy: 'capacity', publish: false });
    expect(result.placements).toEqual([]);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'A', quantity: 5 }),
    ]);
  });

  it('keeps valid cargo loadable while returning an invalid row as remaining', () => {
    const result = loadContainer(container, [box(), box({ id: 'BAD', width: 0 })], { strategy: 'capacity', publish: false });
    expect(result.placements.filter((p) => p.cargoId === 'A')).toHaveLength(1);
    expect(result.placements.some((p) => p.cargoId === 'BAD')).toBe(false);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'BAD' }),
    ]);
  });

  it('returns all normalized cargo as remaining when the container input itself is invalid', () => {
    const result = loadContainer({ ...container, width: 0 }, [box({ quantity: 4 })], { strategy: 'capacity', publish: false });
    expect(result.placements).toEqual([]);
    expect(result.loadedWeightKg).toBe(0);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'A', quantity: 4 }),
    ]);
  });
});
