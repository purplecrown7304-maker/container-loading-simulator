import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem } from './types';

const box = (id: string, weightKg: number): CargoItem => ({
  id,
  name: id,
  length: 0.5,
  width: 1,
  height: 0.4,
  weightKg,
  quantity: 1,
  maxStackLayers: 1,
  maxTopLoadKg: 500,
  allowRotation: false,
});

const pallet = {
  ...defaultPalletSpec,
  length: 1,
  width: 1,
  height: 0.15,
  tareWeightKg: 25,
  maxStackLevels: 2,
  useCornerGuards: true,
  cornerGuardWeightKg: 10,
  useWrapping: false,
  minimizePackaging: true,
};

describe('pallet final mixed payload regression', () => {
  it('does not use free pallet space when cargo plus reserved packaging would exceed payload', () => {
    const result = packOnPallets(
      { length: 2, width: 1, height: 1.2, maxPayloadKg: 84 },
      [box('A', 30), box('B', 20)],
      pallet,
    );

    expect(result.palletCount).toBe(1);
    expect(result.placements.map((placement) => placement.cargoId)).toEqual(['A']);
    expect(result.remaining.find((item) => item.cargoId === 'B')?.quantity).toBe(1);
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(84 + 1e-9);
  });

  it('uses the same free pallet space when the exact reserved payload is available', () => {
    const result = packOnPallets(
      { length: 2, width: 1, height: 1.2, maxPayloadKg: 85 },
      [box('A', 30), box('B', 20)],
      pallet,
    );

    expect(result.palletCount).toBe(1);
    expect(result.placements).toHaveLength(2);
    expect(result.remaining).toHaveLength(0);
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(85 + 1e-9);
  });
});
