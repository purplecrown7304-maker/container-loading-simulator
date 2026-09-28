import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem } from './types';
const box: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: .2, weightKg: 70, quantity: 1, maxStackLayers: 10, maxTopLoadKg: 500, allowRotation: false };
const space = { length: 1, width: 1, height: .35, maxPayloadKg: 95 };
const spec = { ...defaultPalletSpec, length: 1, width: 1, maxStackLevels: 1, useWrapping: true, wrappingExtraHeightM: .05 };
describe('actual pallet packaging reservation', () => {
  for (const strategy of ['capacity', 'stability', 'unloading'] as const) {
    it(`${strategy}: omits unnecessary wrapping at exact height and weight limits`, () => {
      const result = packOnPallets(space, [box], spec, strategy);
      expect(result.placements).toHaveLength(1);
      expect(result.remaining).toEqual([]);
      expect(result.totalPalletizedWeightKg).toBe(95);
      expect(result.totalPackagingWeightKg).toBe(0);
    });
    it(`${strategy}: identifies tare in payload rejection`, () => {
      const result = packOnPallets({ ...space, maxPayloadKg: 94 }, [box], { ...spec, useWrapping: false }, strategy);
      expect(result.placements).toHaveLength(0);
      expect(result.remaining[0].quantity).toBe(1);
      expect(result.remaining[0].reason).toContain('중량 초과');
    });
  }
  it('still reserves mandatory wrapping', () => {
    expect(packOnPallets(space, [box], { ...spec, minimizePackaging: false }).placements).toHaveLength(0);
    const result = packOnPallets({ ...space, height: .4, maxPayloadKg: 96.5 }, [box], { ...spec, minimizePackaging: false });
    expect(result.placements).toHaveLength(1);
    expect(result.totalPalletizedWeightKg).toBe(96.5);
  });
  it('omits guards only when the existing minimum-packaging policy does', () => {
    const guards = { ...spec, useWrapping: false, useCornerGuards: true, cornerGuardWeightKg: 10 };
    expect(packOnPallets(space, [box], guards).placements).toHaveLength(1);
    expect(packOnPallets(space, [box], { ...guards, maxStackLevels: 2 }).placements).toHaveLength(0);
  });
  it('charges wrapping when the eighth box activates it', () => {
    const small = { ...box, length: .25, width: .5, height: .1, weightKg: 1, quantity: 8, maxStackLayers: 1 };
    const result = packOnPallets({ ...space, height: .5, maxPayloadKg: 33 }, [small], spec);
    expect(result.placements).toHaveLength(7);
    expect(result.remaining[0].quantity).toBe(1);
    expect(result.totalPalletizedWeightKg).toBe(32);
    expect(result.remaining[0].reason).toContain('중량 초과');
  });
  it('checks the entire existing top when a mixed SKU activates wrapping', () => {
    const a = { ...box, length: .5, height: .8, weightKg: 10 };
    const b = { ...box, id: 'B', length: .5, height: .2, weightKg: 1 };
    const result = packOnPallets({ ...space, height: .95, maxPayloadKg: 1000 }, [a, b], spec);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining[0].cargoId).toBe('B');
    expect(result.pallets[0].wrappingUsed).toBe(false);
  });
  it('charges wrapping as a load becomes tall', () => {
    const tall = { ...box, height: .45, weightKg: 1, quantity: 2 };
    const result = packOnPallets({ ...space, height: 1.1, maxPayloadKg: 27 }, [tall], spec);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining[0].quantity).toBe(1);
    expect(result.totalPalletizedWeightKg).toBe(26);
  });
  it('reserves newly activated mixed-SKU wrapping without losing either quantity', () => {
    const a = { ...box, length: .5, weightKg: 10 };
    const b = { ...a, id: 'B', weightKg: 1 };
    const rejected = packOnPallets({ ...space, height: .5, maxPayloadKg: 36 }, [a, b], spec);
    expect(rejected.placements.map(p => p.cargoId)).toEqual(['A']);
    expect(rejected.remaining.map(p => [p.cargoId, p.quantity])).toEqual([['B', 1]]);
    const fits = packOnPallets({ ...space, height: .5, maxPayloadKg: 37.5 }, [a, b], spec);
    expect(fits.placements).toHaveLength(2);
    expect(fits.remaining).toEqual([]);
    expect(fits.totalPackagingWeightKg).toBe(1.5);
    expect(fits.totalPalletizedWeightKg).toBe(37.5);
  });
  it('preserves quantities and physical/package bounds across boundary budgets', () => {
    const items = [
      { ...box, length: .5, width: .5, height: .25, weightKg: 3, quantity: 9 },
      { ...box, id: 'B', length: .5, width: .5, height: .15, weightKg: 2, quantity: 5 },
    ];
    for (const strategy of ['capacity', 'stability', 'unloading'] as const) {
      for (const maxPayloadKg of [28, 35, 51, 80, 100]) {
        const bounds = { ...space, length: 2, height: 1.2, maxPayloadKg };
        const result = packOnPallets(bounds, items, { ...spec, wrappingWeightKg: 30 }, strategy);
        expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(maxPayloadKg + 1e-9);
        for (const item of items) {
          expect(result.placements.filter(p => p.cargoId === item.id).length
            + result.remaining.filter(p => p.cargoId === item.id).reduce((n, p) => n + p.quantity, 0)).toBe(item.quantity);
        }
        for (const load of result.pallets) {
          const top = Math.max(...load.cargoPlacements.map(p => p.z + p.height));
          expect(top + load.packagingExtraHeightM).toBeLessThanOrEqual(bounds.height + 1e-9);
          expect(load.totalWeightKg).toBe(load.cargoWeightKg + spec.tareWeightKg + load.packagingWeightKg);
          expect(load.cargoWeightKg).toBeLessThanOrEqual(spec.maxLoadKg);
        }
      }
    }
  });

  it('rejects consolidation when newly required wrapping outweighs the saved pallet bases', () => {
    const items = [
      { ...box, id: '0', length: .4, width: .25, height: .1, weightKg: 1, quantity: 6, maxStackLayers: 5 },
      { ...box, id: '1', length: .5, width: .4, height: .1, weightKg: 8, quantity: 8, maxStackLayers: 5 },
      { ...box, id: '2', length: .5, width: .25, height: .3, weightKg: 3, quantity: 4, maxStackLayers: 5 },
    ];
    const result = packOnPallets({ length: 10, width: 1, height: .8, maxPayloadKg: 87 }, items,
      { ...spec, tareWeightKg: 5, wrappingWeightKg: 40, wrappingExtraHeightM: .01 });
    // Removing the consolidation payload guard yields one 115 kg pallet here.
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(87);
    expect(result.palletCount).toBeGreaterThan(1);
    for (const item of items) {
      expect(result.placements.filter(p => p.cargoId === item.id).length
        + result.remaining.filter(p => p.cargoId === item.id).reduce((n, p) => n + p.quantity, 0)).toBe(item.quantity);
    }
  });

});
