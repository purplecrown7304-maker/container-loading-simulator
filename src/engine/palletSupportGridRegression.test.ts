import { describe, expect, it } from 'vitest';
import { packOnPallets, defaultPalletSpec } from './palletOptimization';
import { palletTopLayerFill } from './palletPacking';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import { validatePlacements } from './constraints';
import type { CargoItem, Placement } from './types';

const container = { length: 1.1, width: 1.1, height: 2.7, maxPayloadKg: 2000 };
const spec = { ...defaultPalletSpec, height: .12, tareWeightKg: 6, maxLoadKg: 1000, maxStackLevels: 1 };
const cargo: CargoItem[] = [
  { id: 'LARGE', name: 'Large carton', length: .235, width: .31, height: .265, weightKg: 11.38, maxTopLoadKg: 42, quantity: 48, allowRotation: true },
  { id: 'SMALL', name: 'Small carton', length: .235, width: .13, height: .265, weightKg: 1.42, maxTopLoadKg: 34.3, quantity: 48, allowRotation: true },
];

describe('pallet mixed-SKU grids follow actual support surfaces', () => {
  it('fills two light-carton tiers without bridging large-carton compression chains', () => {
    const result = packOnPallets(container, cargo, spec);
    expect(result.placements).toHaveLength(96);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(1);
    expect(palletTopLayerFill(result.pallets[0])).toBeGreaterThanOrEqual(.5);
    expect(result.totalPalletizedWeightKg).toBeCloseTo(620.4);
    expect(validatePlacements(container, result.placements)).toEqual([]);
    const cargoMap = new Map(cargo.map(item => [item.id, item]));
    const previous: Placement[] = [];
    for (const placement of [...result.placements].sort((a, b) => a.z - b.z)) {
      expect(hasAdequateSupport(placement, previous, { x: 0, y: 0, z: .12, length: 1.1, width: 1.1 })).toBe(true);
      expect(canPlaceByStackingRules(cargoMap.get(placement.cargoId)!, placement, previous, cargoMap)).toBe(true);
      previous.push(placement);
    }
    expect(packOnPallets(container, cargo, spec)).toEqual(result);
  });

  it('still rejects a new tier when actual cumulative compression exceeds its limit', () => {
    const limited = cargo.map(item => ({ ...item, maxTopLoadKg: item.id === 'LARGE' ? 34.14 : item.maxTopLoadKg }));
    const result = packOnPallets(container, limited, spec);
    expect(result.placements.length).toBeLessThan(96);
    expect(result.placements.length + result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(96);
    const cargoMap = new Map(limited.map(item => [item.id, item]));
    const previous: Placement[] = [];
    for (const placement of [...result.placements].sort((a, b) => a.z - b.z)) {
      expect(canPlaceByStackingRules(cargoMap.get(placement.cargoId)!, placement, previous, cargoMap)).toBe(true);
      previous.push(placement);
    }
  });
  it('loads a large two-product shipment without dropping cartons to the top-tier policy', () => {
    // Sanitized regression for the 928 large / 732 small packaged-carton case.
    // Keep the recorded carton strength and the catalog-matching lightweight T11.
    const shipment: CargoItem[] = [
      { ...cargo[0], quantity: 927 },
      { ...cargo[0], id: 'LARGE-PARTIAL', quantity: 1, weightKg: 7.54 },
      { ...cargo[1], quantity: 731 },
      { ...cargo[1], id: 'SMALL-PARTIAL', quantity: 1, weightKg: 1.18 },
    ];
    const space = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
      floorLoadLimitKgPerM2: 1500, ceilingClearanceM: .05, unloadingPolicy: 'strict' as const };
    const result = packOnPallets(space, shipment, { ...spec, maxStackLevels: 2, maxStaticLoadKg: 1000 });
    expect(result.placements).toHaveLength(1660);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(20);
    expect(result.totalPalletizedWeightKg).toBeCloseTo(11716);
    expect(validatePlacements(space, result.placements)).toEqual([]);
    const map = new Map(shipment.map(item => [item.id, item]));
    for (const load of result.pallets) {
      if (!load.isMixedTail) expect(palletTopLayerFill(load)).toBeGreaterThanOrEqual(.5);
      expect(load.cargoWeightKg).toBeLessThanOrEqual(spec.maxLoadKg);
      const previous: Placement[] = [];
      const base = { x: load.x, y: load.y, z: load.z + load.height, length: load.length, width: load.width };
      for (const placement of [...load.cargoPlacements].sort((a, b) => a.z - b.z)) {
        expect(hasAdequateSupport(placement, previous, base)).toBe(true);
        expect(canPlaceByStackingRules(map.get(placement.cargoId)!, placement, previous, map)).toBe(true);
        expect(placement.z + placement.height).toBeLessThanOrEqual(2.65 + 1e-6);
        previous.push(placement);
      }
    }
  }, 180_000);

  it('does not materialize millions of empty deck cells for one small item', () => {
    const tiny: CargoItem = { id: 'TINY', name: 'Small item', length: .001, width: .001, height: .001,
      weightKg: .001, quantity: 1, allowRotation: false };
    const result = packOnPallets(container, [tiny], spec);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining).toEqual([]);
  });

});
