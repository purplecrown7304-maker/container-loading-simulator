import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 3, width: 2, height: 2.4, maxPayloadKg: 5000 };
const pallet = { ...defaultPalletSpec, length: 1, width: 1, height: 0.15, tareWeightKg: 20, maxStackLevels: 1 };
const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A',
  name: 'A',
  length: 0.5,
  width: 0.5,
  height: 0.4,
  weightKg: 10,
  quantity: 1,
  maxStackLayers: 2,
  allowRotation: false,
  ...overrides,
});

describe('pallet input preflight regression', () => {
  it('merges repeated rows for the same SKU before pallet optimization', () => {
    const result = packOnPallets(container, [box({ quantity: 1 }), box({ quantity: 2 })], pallet);
    expect(result.placements.filter((p) => p.cargoId === 'A')).toHaveLength(3);
    expect(result.remaining).toEqual([]);
  });

  it('rejects conflicting duplicate SKU rows before any pallet is created', () => {
    const result = packOnPallets(container, [box({ quantity: 2 }), box({ weightKg: 11, quantity: 3 })], pallet);
    expect(result.palletCount).toBe(0);
    expect(result.placements).toEqual([]);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'A', quantity: 5 }),
    ]);
  });

  it('keeps valid cargo while returning an invalid cargo row as remaining', () => {
    const result = packOnPallets(container, [box(), box({ id: 'BAD', height: 0 })], pallet);
    expect(result.placements.filter((p) => p.cargoId === 'A')).toHaveLength(1);
    expect(result.placements.some((p) => p.cargoId === 'BAD')).toBe(false);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'BAD' }),
    ]);
  });

  it('fails closed when container or pallet configuration is invalid', () => {
    const badContainer = packOnPallets({ ...container, maxPayloadKg: 0 }, [box({ quantity: 2 })], pallet);
    expect(badContainer.placements).toEqual([]);
    expect(badContainer.remaining[0]).toEqual(expect.objectContaining({ cargoId: 'A', quantity: 2 }));

    const badPallet = packOnPallets(container, [box({ quantity: 2 })], { ...pallet, maxLoadKg: 0 });
    expect(badPallet.placements).toEqual([]);
    expect(badPallet.palletCount).toBe(0);
    expect(badPallet.optimization.candidateCount).toBe(0);
  });
});
