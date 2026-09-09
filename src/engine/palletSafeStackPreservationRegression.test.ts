import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 2.2,
  width: 1.1,
  height: 1.4,
  maxPayloadKg: 5000,
};

const cargo: CargoItem[] = [{
  id: 'SAFE-STACK',
  name: 'SAFE-STACK',
  length: 0.55,
  width: 0.55,
  height: 0.4,
  weightKg: 10,
  quantity: 8,
  maxStackLayers: 1,
  maxTopLoadKg: 1000,
  allowRotation: false,
}];

describe('safe pallet stack preservation', () => {
  it('keeps a safe two-level stack even when a free floor slot exists', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
      useCornerGuards: false,
      useWrapping: false,
    });

    expect(result.placements).toHaveLength(8);
    expect(result.remaining).toEqual([]);
    expect(result.optimization.selectedStackTarget).toBe(2);
    expect(result.maxUsedStackLevel).toBe(2);
    expect(result.stackedPallets).toBe(1);
    expect(result.optimization.floorPositions).toBe(1);
    expect(new Set(result.pallets.map((pallet) => pallet.stackColumn)).size).toBe(1);
  });
});
