import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 3,
  width: 1,
  height: 1.5,
  maxPayloadKg: 5000,
};

function box(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'BOX',
    name: 'BOX',
    length: 1,
    width: 1,
    height: 0.4,
    weightKg: 60,
    quantity: 2,
    maxStackLayers: 3,
    maxTopLoadKg: 50,
    allowRotation: false,
    ...overrides,
  };
}

const pallet = {
  ...defaultPalletSpec,
  length: 1,
  width: 1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
  maxStackLevels: 1,
  useCornerGuards: false,
  useWrapping: false,
};

describe('pallet box top-load regression', () => {
  it('does not stack a box when the lower box top-load limit is smaller than the upper box weight', () => {
    const result = packOnPallets(container, [box()], pallet);

    expect(result.placements).toHaveLength(2);
    expect(result.palletCount).toBe(2);
    expect(result.remaining).toHaveLength(0);
    expect(result.pallets.every((load) => load.cargoPlacements.length === 1)).toBe(true);
    expect(result.pallets.every((load) => Math.abs(load.cargoPlacements[0].z - 0.15) < 1e-9)).toBe(true);
  });

  it('blocks the third layer when accumulated upper weight exceeds the base box top-load limit', () => {
    const result = packOnPallets(
      container,
      [box({ quantity: 3, weightKg: 60, maxTopLoadKg: 100 })],
      pallet,
    );

    expect(result.placements).toHaveLength(3);
    expect(result.palletCount).toBe(2);
    expect(result.remaining).toHaveLength(0);
    expect(Math.max(...result.pallets.map((load) => load.cargoPlacements.length))).toBe(2);
  });
});
