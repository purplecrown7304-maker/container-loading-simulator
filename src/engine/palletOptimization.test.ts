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
  it('mixes three partial SKUs into two pallets and preserves a supported second tier', () => {
    const mixed = ['A', 'B', 'C'].map(id => ({ ...cargo[0], id, quantity: 2,
      length: .5, width: .5, height: .4, maxStackLayers: 1, maxTopLoadKg: 500 }));
    const result = packOnPallets({ ...container, length: 4, width: 2, height: 2 }, mixed, {
      ...defaultPalletSpec, length: 1, width: 1, maxStackLevels: 2,
    }, 'capacity');
    expect(result.placements).toHaveLength(6);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(2);
    expect(result.maxUsedStackLevel).toBe(2);
    expect(result.optimization.floorPositions).toBe(1);
    expect(result.pallets.some(load => new Set(load.cargoPlacements.map(p => p.cargoId)).size > 1)).toBe(true);
  });

  it('keeps mixed unloading pallets within the same stop', () => {
    const mixed = ['A', 'B', 'C'].map((id, index) => ({ ...cargo[0], id, quantity: 2,
      length: .5, width: .5, height: .4, maxStackLayers: 1, unloadPriority: index < 2 ? 1 : 2 }));
    const result = packOnPallets(container, mixed, { ...defaultPalletSpec, length: 1, width: 1 }, 'unloading');
    expect(result.placements).toHaveLength(6);
    expect(result.palletCount).toBe(2);
    expect(result.pallets.some(load => new Set(load.cargoPlacements.map(p => p.cargoId)).size > 1)).toBe(true);
    for (const load of result.pallets) {
      expect(new Set(load.cargoPlacements.map(p => mixed.find(item => item.id === p.cargoId)!.unloadPriority)).size).toBe(1);
    }
  });

  it('capacity preserves permitted pallet stacking to leave free floor space', () => {
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
    expect(result.optimization.redistributedForLowUtilization).toBe(false);
    expect(result.placements).toHaveLength(32);
    expect(result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(0);
  });

  it('only stability redistributes low-utilization pallet columns across the container length', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    }, 'stability');

    expect(result.optimization.redistributedForLowUtilization).toBe(true);
    expect(Math.max(...result.pallets.map((pallet) => pallet.x))).toBeGreaterThan(container.length * 0.7);
  });

  it('keeps low-utilization floor lanes centered as a group', () => {
    const result = packOnPallets(container, cargo, {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      maxStackLevels: 2,
      maxSupportedTopWeightKg: 1000,
    });

    const floorPallets = result.pallets.filter((pallet) => pallet.stackLevel === 1);
    expect(floorPallets.length).toBeGreaterThan(0);
    const minY = Math.min(...floorPallets.map((pallet) => pallet.y));
    const maxY = Math.max(...floorPallets.map((pallet) => pallet.y + pallet.width));
    expect((minY + maxY) / 2).toBeCloseTo(container.width / 2, 5);
    floorPallets.forEach((pallet) => {
      expect(pallet.y).toBeGreaterThanOrEqual(-1e-9);
      expect(pallet.y + pallet.width).toBeLessThanOrEqual(container.width + 1e-9);
    });
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
