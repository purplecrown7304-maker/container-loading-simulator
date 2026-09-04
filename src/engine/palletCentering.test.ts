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
  it('centers the cargo footprint on its pallet and the pallet group on the container', () => {
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
    expect(pallet.x + pallet.length / 2).toBeCloseTo(container.length / 2, 6);
    expect(pallet.y + pallet.width / 2).toBeCloseTo(container.width / 2, 6);
    expect(placement.x).toBeGreaterThanOrEqual(pallet.x - 1e-9);
    expect(placement.x + placement.length).toBeLessThanOrEqual(pallet.x + pallet.length + 1e-9);
    expect(placement.y).toBeGreaterThanOrEqual(pallet.y - 1e-9);
    expect(placement.y + placement.width).toBeLessThanOrEqual(pallet.y + pallet.width + 1e-9);
  });
});
