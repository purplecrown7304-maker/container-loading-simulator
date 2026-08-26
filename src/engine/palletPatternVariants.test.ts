import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { applyPalletPatternVariant } from './palletPatternVariants';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.032, width: 2.352, height: 2.698, maxPayloadKg: 26540 };
const cargo: CargoItem[] = [{
  id: 'BOX-PATTERN', name: 'Pattern box', length: 0.4, width: 0.3, height: 0.2,
  weightKg: 8, quantity: 8, maxStackLayers: 6, maxTopLoadKg: 120, allowRotation: true,
}];

describe('pallet pattern variants', () => {
  it('keeps loaded quantity when brick pattern is feasible', () => {
    const base = packOnPallets(container, cargo, { ...defaultPalletSpec, maxStackLevels: 1 });
    const patterned = applyPalletPatternVariant(base, cargo, defaultPalletSpec, container, 'brick');
    expect(patterned).toBeTruthy();
    expect(patterned?.placements).toHaveLength(base.placements.length);
    expect(patterned?.remaining).toEqual(base.remaining);
  });

  it('keeps boxes inside the pallet footprint for a pinwheel candidate', () => {
    const base = packOnPallets(container, cargo, { ...defaultPalletSpec, maxStackLevels: 1 });
    const patterned = applyPalletPatternVariant(base, cargo, defaultPalletSpec, container, 'pinwheel');
    if (!patterned) return;
    for (const load of patterned.pallets) {
      for (const box of load.cargoPlacements) {
        expect(box.x).toBeGreaterThanOrEqual(load.x - 1e-8);
        expect(box.y).toBeGreaterThanOrEqual(load.y - 1e-8);
        expect(box.x + box.length).toBeLessThanOrEqual(load.x + load.length + 1e-8);
        expect(box.y + box.width).toBeLessThanOrEqual(load.y + load.width + 1e-8);
      }
    }
  });
});
