import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, preparePalletsForLoading as packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

// Field report 2026-09-29 (#84): a pallet carrying only a few cartons rode on top of
// another stack while the neighbouring pallet still had spare top layers. In practice
// those cartons are loaded onto the other pallet and the extra pallet is not used.
const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const spec = { ...defaultPalletSpec, maxStackLevels: 2 };
const carton = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 12, quantity: 45, ...overrides,
});
const strategies = ['capacity', 'stability', 'unloading'] as const;
const cargoHeight = (load: { z: number; height: number; cargoPlacements: Array<{ z: number; height: number }> }) =>
  Math.max(...load.cargoPlacements.map(p => p.z + p.height)) - load.z - load.height;

describe('sparse pallet absorption (field practice, every strategy)', () => {
  it.each(strategies)('%s: few leftover cartons join another pallet instead of a separate stacked pallet', strategy => {
    const result = packOnPallets(container, [carton()], spec, strategy);
    expect(result.placements).toHaveLength(45);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(2);
    expect(result.pallets.every(load => load.cargoPlacements.length > 1)).toBe(true);
    for (const load of result.pallets) {
      expect(load.cargoWeightKg).toBeLessThanOrEqual(spec.maxLoadKg);
      expect(cargoHeight(load) + load.height + load.packagingExtraHeightM).toBeLessThanOrEqual(container.height + 1e-9);
      for (const p of load.cargoPlacements) expect(p.z + p.height).toBeLessThanOrEqual(container.height + 1e-9);
    }
  });

  it('declared carton stack limit still blocks absorption', () => {
    const result = packOnPallets(container, [carton({ maxStackLayers: 5 })], spec, 'capacity');
    expect(result.placements).toHaveLength(45);
    for (const load of result.pallets) expect(cargoHeight(load)).toBeLessThanOrEqual(5 * 0.3 + 1e-9);
    expect(result.palletCount).toBe(3);
  });

  it('pallet max load still blocks absorption', () => {
    const result = packOnPallets(container, [carton({ weightKg: 45 })], { ...spec, maxLoadKg: 20 * 45 }, 'capacity');
    expect(result.placements).toHaveLength(45);
    for (const load of result.pallets) expect(load.cargoWeightKg).toBeLessThanOrEqual(20 * 45 + 1e-9);
    expect(result.palletCount).toBe(3);
  });

  it('unloading absorbs only within the same stop', () => {
    const cargo = [carton({ quantity: 40, unloadPriority: 1 }), carton({ id: 'B', name: 'B', quantity: 5, unloadPriority: 2 })];
    const result = packOnPallets(container, cargo, spec, 'unloading');
    expect(result.placements).toHaveLength(45);
    for (const load of result.pallets) {
      expect(new Set(load.cargoPlacements.map(p => cargo.find(item => item.id === p.cargoId)!.unloadPriority)).size).toBe(1);
    }
  });

  it('is deterministic', () => {
    for (const strategy of strategies) {
      const a = packOnPallets(container, [carton()], spec, strategy);
      const b = packOnPallets(container, [carton()], spec, strategy);
      expect(b.placements).toEqual(a.placements);
    }
  });
});
