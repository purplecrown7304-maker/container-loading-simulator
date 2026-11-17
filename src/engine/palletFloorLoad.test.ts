import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets as packBase, type PalletSpec, type PalletPackingResult } from './palletPacking';
import { packOnPallets } from './palletOptimization';
import { palletLoadsWithinFloorLoadLimit } from './palletFloorLoad';
import type { CargoItem, ContainerSpec } from './types';

const pallet: PalletSpec = { ...defaultPalletSpec, length: 1, width: 1, height: .1,
  tareWeightKg: 10, maxLoadKg: 1000, maxStackLevels: 2, maxSupportedTopWeightKg: 1000, maxStaticLoadKg: 1500 };
const container: ContainerSpec = { length: 4, width: 2, height: 2.4, maxPayloadKg: 6000, floorLoadLimitKgPerM2: 100 };
const item: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: .2,
  weightKg: 50, quantity: 2, maxStackLayers: 6, maxTopLoadKg: 1000, allowRotation: false };
const conserved = (rows: CargoItem[], result: Pick<PalletPackingResult, 'placements' | 'remaining'>) => {
  for (const row of rows) expect(result.placements.filter(p => p.cargoId === row.id).length
    + result.remaining.filter(r => r.cargoId === row.id).reduce((sum, r) => sum + r.quantity, 0)).toBe(row.quantity);
};

describe('pallet candidate hard floor load enforcement', () => {
  it('rejects the reported 30-carton floor overload instead of spreading it across pallet area', () => {
    const space = { ...container, length: 3.6, width: 2.2, floorLoadLimitKgPerM2: 250, floorLoadWarningMultiplier: 3 };
    const spec = { ...pallet, length: 1.1, width: 1.1, height: .15, tareWeightKg: 25, maxStackLevels: 1 };
    const rows = [{ ...item, length: .5, width: .5, weightKg: 100, quantity: 30, maxTopLoadKg: 150 }];
    const result = packOnPallets(space, rows, spec, 'capacity');
    expect(result.placements).toEqual([]);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 30, reasonCode: 'FLOOR_LOAD_LIMIT',
      reason: expect.stringContaining('FLOOR_LOAD_LIMIT') })]);
    conserved(rows, result);
    expect(packOnPallets(space, rows, spec, 'capacity')).toEqual(result);
    const allowed = packOnPallets({ ...space, floorLoadLimitKgPerM2: 2500 }, rows, spec, 'capacity');
    expect(allowed.placements).toHaveLength(30);
    expect(palletLoadsWithinFloorLoadLimit({ ...space, floorLoadLimitKgPerM2: 2500 }, allowed.pallets, spec)).toBe(true);
  });

  it('includes deck tare when deciding whether even one carton can load', () => {
    const rows = [{ ...item, weightKg: 95, quantity: 1 }];
    const rejected = packOnPallets(container, rows, pallet);
    expect(rejected.placements).toEqual([]);
    expect(rejected.remaining[0]).toMatchObject({ quantity: 1, reasonCode: 'FLOOR_LOAD_LIMIT' });
    expect(packOnPallets({ ...container, floorLoadLimitKgPerM2: 105 }, rows, pallet).placements).toHaveLength(1);
    conserved(rows, rejected);
  });

  it('reserves the declared packaging mass before placing cartons', () => {
    const rows = [{ ...item, weightKg: 89, quantity: 1 }];
    const spec = { ...pallet, useWrapping: true, wrappingWeightKg: 2, minimizePackaging: false };
    expect(packOnPallets(container, rows, spec).placements).toEqual([]); // 89 + 10 + 2 = 101
    expect(packOnPallets({ ...container, floorLoadLimitKgPerM2: 101 }, rows, spec).placements).toHaveLength(1);
  });

  it('rejects a stacked column when two individually safe decks exceed the shared projection', () => {
    const space = { ...container, length: 1, width: 1 };
    const spec = { ...pallet, maxLoadKg: 50 };
    const result = packBase(space, [item], spec);
    expect(result.placements).toHaveLength(1); // one carton + deck = 60; two = 120
    expect(result.stackedPallets).toBe(0);
    expect(result.remaining[0]).toMatchObject({ quantity: 1, reasonCode: 'FLOOR_LOAD_LIMIT' });
    expect(palletLoadsWithinFloorLoadLimit(space, result.pallets, spec)).toBe(true);
    conserved([item], result);
    expect(packBase(space, [item], spec)).toEqual(result);
    expect(packBase({ ...space, floorLoadLimitKgPerM2: 120 }, [item], spec).placements).toHaveLength(2);
  });

  it('keeps the old output identical when the limit is missing or safely high', () => {
    const without = packOnPallets({ ...container, floorLoadLimitKgPerM2: undefined }, [item], pallet);
    expect(packOnPallets({ ...container, floorLoadLimitKgPerM2: 10000 }, [item], pallet)).toEqual(without);
  });
});
