import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

function box(quantity: number): CargoItem {
  return {
    id: 'LANE',
    name: 'LANE',
    length: 1.1,
    width: 1.1,
    height: 0.4,
    weightKg: 100,
    quantity,
    maxStackLayers: 1,
    maxTopLoadKg: 1000,
    allowRotation: false,
  };
}

const pallet = {
  ...defaultPalletSpec,
  length: 1.1,
  width: 1.1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
  maxStackLevels: 1,
  useCornerGuards: false,
  useWrapping: false,
};

describe('pallet lane centering regression', () => {
  it('splits the leftover width equally on both sides for a standard 40ft two-lane row', () => {
    const container: ContainerSpec = {
      length: 2.2,
      width: 2.35,
      height: 1.2,
      maxPayloadKg: 5000,
    };
    const result = packOnPallets(container, [box(2)], pallet);
    const ys = result.pallets.map((load) => load.y).sort((a, b) => a - b);

    expect(result.palletCount).toBe(2);
    expect(ys[0]).toBeCloseTo(0.075, 6);
    expect(ys[1]).toBeCloseTo(1.175, 6);
    expect(ys[0]).toBeCloseTo(container.width - (ys[1] + pallet.width), 6);
    expect(result.lateralImbalanceKg).toBeCloseTo(0, 6);
  });

  it('treats an exactly centered pallet as neutral instead of assigning all its weight to the right side', () => {
    const container: ContainerSpec = {
      length: 1.1,
      width: 1.5,
      height: 1.2,
      maxPayloadKg: 5000,
    };
    const result = packOnPallets(container, [box(1)], pallet);

    expect(result.palletCount).toBe(1);
    expect(result.pallets[0].y).toBeCloseTo(0.2, 6);
    expect(result.pallets[0].centerOfGravity.y).toBeCloseTo(container.width / 2, 6);
    expect(result.lateralImbalanceKg).toBeCloseTo(0, 6);
  });
});
