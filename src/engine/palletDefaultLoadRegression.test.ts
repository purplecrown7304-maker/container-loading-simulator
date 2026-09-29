import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';

// 대표 결정 2026-09-29 (#88): the default pallet carries 1,500 kg of cargo. With the old
// 1,000 kg default, 16 kg cartons stopped at two tiers and part of the order was left behind.
describe('default pallet max load', () => {
  it('is 1,500 kg of cargo', () => {
    expect(defaultPalletSpec.maxLoadKg).toBe(1500);
  });

  it('stacks 16 kg cartons three tiers high and loads the whole order in a 20ft', () => {
    const container = { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28000 };
    const result = packOnPallets(container, [{ id: 'A', name: 'A', length: 0.24, width: 0.13, height: 0.27, weightKg: 16, quantity: 700, maxStackLayers: 10, maxTopLoadKg: 100 }], defaultPalletSpec, 'capacity');
    expect(result.placements).toHaveLength(700);
    expect(result.remaining).toEqual([]);
    for (const load of result.pallets) expect(load.cargoWeightKg).toBeLessThanOrEqual(1500 + 1e-9);
    const tallest = Math.max(...result.pallets.map(load => Math.max(...load.cargoPlacements.map(p => p.z + p.height)) - load.z - load.height));
    expect(Math.round(tallest / 0.27)).toBeGreaterThanOrEqual(3);
  });
});
