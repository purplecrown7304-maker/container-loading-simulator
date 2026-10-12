import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import * as support from './support';
import type { CargoItem } from './types';

const cargo: CargoItem = {
  id: 'full', name: 'Full', length: 1, width: 1, height: .2,
  weightKg: 10, quantity: 3, maxTopLoadKg: 30, maxStackLayers: 10, allowRotation: false,
};
const pallet = {
  ...defaultPalletSpec, length: 1, width: 1, height: .1,
  tareWeightKg: 1, maxLoadKg: 25, maxStackLevels: 2,
};

describe('initial pallet slot reuse', () => {
  it('retries a failed pallet for a lighter partial SKU and preserves every output field', () => {
    const space = { length: 1, width: 1, height: 2, maxPayloadKg: 10000 };
    const rows = [cargo, { ...cargo, id: 'partial', name: 'Partial', weightKg: 5, quantity: 1 }];
    const result = packOnPallets(space, rows, pallet);
    // The first pallet rejects another 10 kg full carton, but still accepts the
    // 5 kg partial carton. A cache shared between SKU loops would miss this slot.
    expect(result.pallets[0].cargoPlacements.map(p => p.cargoId)).toEqual(['full', 'full', 'partial']);
    expect(result.remaining).toEqual([]);
    // Captured from the pre-optimization implementation, including coordinates,
    // ordering, stack columns, weights, packaging and all result metrics.
    expect(createHash('sha256').update(JSON.stringify(result)).digest('hex'))
      .toBe('1ffc803f5b7bb3922c4de35558cbb4f54ae7aafb22f4c6715a712595053c9ce4');
    expect(packOnPallets(space, rows, pallet)).toEqual(result);
  });

  it('does not repeatedly search unchanged compression-limited pallets', () => {
    const checks = vi.spyOn(support, 'hasAdequateSupport');
    try {
      const result = packOnPallets(
        { length: 16, width: 1, height: 2, maxPayloadKg: 10000 },
        [{ ...cargo, quantity: 32, maxTopLoadKg: 10 }],
        { ...pallet, maxLoadKg: 1000, maxStackLevels: 1 },
      );
      expect(result.placements).toHaveLength(32);
      expect(result.palletCount).toBe(16);
      expect(result.remaining).toEqual([]);
      expect(result.pallets.every(load => load.cargoPlacements.length === 2)).toBe(true);
      // Deterministic work-count guard, not a device-dependent time cutoff.
      // The old repeated searches made 424 checks; reuse makes 167, including
      // the unchanged later consolidation attempts and all safety checks.
      expect(checks.mock.calls.length).toBeLessThanOrEqual(200);
    } finally {
      checks.mockRestore();
    }
  });
});
