import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const cargo: CargoItem = {
  id: 'TALL',
  name: 'TALL',
  length: 1.1,
  width: 1.1,
  height: 0.84,
  weightKg: 50,
  quantity: 1,
  maxStackLayers: 1,
  allowRotation: false,
};

const container: ContainerSpec = {
  length: 1.1,
  width: 1.1,
  height: 1.0,
  maxPayloadKg: 5000,
};

describe('pallet packaging clearance regression', () => {
  it('reserves possible packaging height even when minimum-packaging mode is enabled', () => {
    const result = packOnPallets(container, [cargo], {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      useCornerGuards: true,
      cornerGuardExtraHeightM: 0.03,
      useWrapping: false,
      minimizePackaging: true,
    });

    // 0.15m pallet + 0.84m cargo fits geometrically at 0.99m,
    // but a possible 0.03m corner-guard allowance would exceed the 1.0m ceiling.
    expect(result.placements).toHaveLength(0);
    expect(result.remaining.find((item) => item.cargoId === 'TALL')?.quantity).toBe(1);
  });

  it('accepts the same cargo when the enabled packaging clearance safely fits', () => {
    const result = packOnPallets(
      { ...container, height: 1.03 },
      [cargo],
      {
        ...defaultPalletSpec,
        length: 1.1,
        width: 1.1,
        height: 0.15,
        maxStackLevels: 2,
        useCornerGuards: true,
        cornerGuardExtraHeightM: 0.03,
        useWrapping: false,
        minimizePackaging: true,
      },
    );

    expect(result.placements).toHaveLength(1);
    expect(result.remaining).toHaveLength(0);
  });
});
