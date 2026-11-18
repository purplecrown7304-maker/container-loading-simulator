import { describe, expect, it } from 'vitest';
import { centerPalletCargo } from './palletCentering';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 2.2,
  width: 1.1,
  height: 2.6,
  maxPayloadKg: 5000,
};

const cargo: CargoItem[] = [{
  id: 'CENTER',
  name: 'CENTER',
  length: 0.6,
  width: 0.4,
  height: 0.35,
  weightKg: 20,
  quantity: 1,
  maxStackLayers: 4,
  maxTopLoadKg: 500,
  allowRotation: false,
}];

describe('centerPalletCargo', () => {
  it('centers the cargo footprint on its pallet, centers the group across the width and keeps it on the inner wall', () => {
    const packed = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      maxStackLevels: 1,
    });
    const centered = centerPalletCargo(packed, container);
    const pallet = centered.pallets[0];
    const placement = pallet.cargoPlacements[0];

    expect(placement.x + placement.length / 2).toBeCloseTo(pallet.x + pallet.length / 2, 6);
    expect(placement.y + placement.width / 2).toBeCloseTo(pallet.y + pallet.width / 2, 6);
    // Owner decision 2026-11-18: a light load is not parked mid-container to balance it.
    expect(pallet.x).toBeCloseTo(0, 6);
    expect(pallet.y + pallet.width / 2).toBeCloseTo(container.width / 2, 6);
    expect(placement.x).toBeGreaterThanOrEqual(pallet.x - 1e-9);
    expect(placement.x + placement.length).toBeLessThanOrEqual(pallet.x + pallet.length + 1e-9);
    expect(placement.y).toBeGreaterThanOrEqual(pallet.y - 1e-9);
    expect(placement.y + placement.width).toBeLessThanOrEqual(pallet.y + pallet.width + 1e-9);
  });

  it('moves a heavy group toward the door only as far as the proportional CG verdict requires', () => {
    const long: ContainerSpec = { length: 12, width: 2.35, height: 2.6, maxPayloadKg: 1000 };
    const heavy: CargoItem[] = [{ ...cargo[0], length: 1, width: 1, height: .5, weightKg: 900, quantity: 1, maxTopLoadKg: 0, maxStackLayers: 1 }];
    const centered = centerPalletCargo(packOnPallets(long, heavy, { ...defaultPalletSpec, maxStackLevels: 1 }), long);
    expect(centered.placements).toHaveLength(1);
    const placement = centered.placements[0];
    // Allowed deviation = 5% × 12 m × (1000 / 900) = 0.667 m from the 6 m centre.
    const allowed = long.length * .05 * (long.maxPayloadKg / 900);
    expect(placement.x + placement.length / 2).toBeCloseTo(long.length / 2 - allowed, 5);
    expect(centered.pallets[0].x).toBeGreaterThan(0);
    // A light version of the same load stays on the wall.
    const light = centerPalletCargo(packOnPallets(long, [{ ...heavy[0], weightKg: 50 }], { ...defaultPalletSpec, maxStackLevels: 1 }), long);
    expect(light.pallets[0].x).toBeCloseTo(0, 6);
  });
});
