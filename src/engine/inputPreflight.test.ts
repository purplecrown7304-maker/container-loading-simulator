import { describe, expect, it } from 'vitest';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import type { CargoItem } from './types';

const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A',
  name: 'A box',
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
  quantity: 2,
  maxStackLayers: 4,
  ...overrides,
});

describe('input preflight', () => {
  it('merges duplicate SKU rows when physical constraints match', () => {
    const result = preflightCargoInput([box({ quantity: 2 }), box({ quantity: 3 })]);
    expect(result.rejected).toEqual([]);
    expect(result.cargo).toHaveLength(1);
    expect(result.cargo[0].quantity).toBe(5);
  });

  it('rejects all rows for a duplicate SKU when dimensions conflict', () => {
    const result = preflightCargoInput([box({ quantity: 2 }), box({ width: 0.45, quantity: 3 })]);
    expect(result.cargo).toEqual([]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ cargoId: 'A', quantity: 5 }),
    ]);
  });

  it.each([
    ['zero length', box({ length: 0 })],
    ['negative width', box({ width: -1 })],
    ['zero weight', box({ weightKg: 0 })],
    ['fractional quantity', box({ quantity: 1.5 })],
    ['zero max stack', box({ maxStackLayers: 0 })],
    ['negative top load', box({ maxTopLoadKg: -1 })],
  ])('rejects %s without passing it to the packing engine', (_label, invalid) => {
    const result = preflightCargoInput([invalid]);
    expect(result.cargo).toEqual([]);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects invalid container dimensions and payload', () => {
    expect(containerInputError({ length: 0, width: 2.35, height: 2.39, maxPayloadKg: 26000 })).toContain('길이');
    expect(containerInputError({ length: 12.03, width: 2.35, height: 2.39, maxPayloadKg: 0 })).toContain('최대 적재중량');
  });
});
