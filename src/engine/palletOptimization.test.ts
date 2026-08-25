import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const cargo: CargoItem[] = [{
  id: 'BOX-A',
  name: 'BOX A',
  length: 0.5,
  width: 0.5,
  height: 0.5,
  weightKg: 20,
  quantity: 32,
  maxStackLayers: 2,
  maxTopLoadKg: 500,
  allowRotation: false,
}];

describe('report-driven pallet optimization', () => {
  it('compares pallet stack targets instead of always maximizing one pallet height', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    });

    expect(result.optimization.candidateCount).toBe(2);
    expect(result.optimization.selectedStackTarget).toBe(2);
    expect(result.maxUsedStackLevel).toBe(2);
    expect(result.optimization.floorPositions).toBeLessThan(result.palletCount);
    expect(result.placements).toHaveLength(32);
  });

  it('redistributes low-utilization pallet columns across the container length', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    });

    expect(result.optimization.redistributedForLowUtilization).toBe(true);
    expect(Math.max(...result.pallets.map((pallet) => pallet.x))).toBeGreaterThan(container.length * 0.7);
  });

  it('keeps a single low-utilization pallet lane on the container centerline', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    });

    const floorPallets = result.pallets.filter((pallet) => pallet.stackLevel === 1);
    const expectedY = (container.width - 1.1) / 2;
    expect(floorPallets.length).toBeGreaterThan(0);
    floorPallets.forEach((pallet) => expect(pallet.y).toBeCloseTo(expectedY, 5));
  });

  it('never loses cargo while evaluating global pallet candidates', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    });

    expect(result.placements.length + result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(32);
  });
});
