import { afterEach, expect, it, vi } from 'vitest';
import * as packing from './palletPacking';
import { packOnPallets } from './palletOptimization';
import type { CargoItem, Placement } from './types';

afterEach(() => vi.restoreAllMocks());

const container = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
const spec = { ...packing.defaultPalletSpec, maxStackLevels: 1, maxStaticLoadKg: 0 };

it('does not repack the same impossible homogeneous pair for every pallet', () => {
  const repack = vi.spyOn(packing, 'packOnPallets');
  const cargo: CargoItem = { id: 'A', name: 'A', length: .2, width: .15, height: .1,
    weightKg: 1, quantity: 500, allowRotation: true, maxStackLayers: 1, strengthUnverified: true };
  const result = packOnPallets(container, [cargo], spec, 'capacity');
  expect(result.palletCount).toBe(15);
  expect(result.placements).toHaveLength(500);
  expect(result.remaining).toEqual([]);
  expect(result.pallets.every(load => load.cargoPlacements.every(p => p.z === load.z + spec.height))).toBe(true);
  // 15 pallets formerly triggered 105 pair repacks, even though only the full
  // 35+35 and tail 35+10 cargo combinations exist. No wall-clock assertion.
  expect(repack.mock.calls.length).toBeLessThanOrEqual(3);
});

function load(index: number, item: CargoItem, x = 0): packing.PalletLoad {
  const placement: Placement = { cargoId: item.id, x, y: 0, z: .15,
    length: item.length, width: item.width, height: item.height, weightKg: item.weightKg };
  return { palletIndex: index, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: index,
    length: 1, width: 1, height: .15, cargoPlacements: [placement], cargoWeightKg: item.weightKg,
    packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: item.weightKg + 25, centerOfGravity: { x: .5, y: .5, z: .2 } };
}

it('retries a failed carton when another source creates a complete support surface', () => {
  const cargo = (id: string, length: number, height: number): CargoItem => ({ id, name: id,
    length, width: 1, height, weightKg: 1, quantity: 1, allowRotation: false, maxStackLayers: 3, maxTopLoadKg: 100 });
  const bridge = cargo('bridge', 1, .2), small = cargo('small', .5, .4), large = cargo('large', .5, .4);
  const input = [load(1, bridge), load(2, small), load(3, large, .5)];
  const before = structuredClone(input);
  const result = packing.absorbSparsePallets(input, [bridge, small, large], { ...spec, length: 1, width: 1 }, container, 'capacity', 2);
  // Neither half-deck initially supports the bridge. Moving the second box
  // beside the larger one opens a legal surface, invalidating the old null slot.
  expect(result.removed).toBe(2);
  expect(result.pallets).toHaveLength(1);
  expect(result.pallets[0].cargoPlacements.map(p => p.cargoId).sort()).toEqual(['bridge', 'large', 'small']);
  expect(result.pallets[0].cargoPlacements.find(p => p.cargoId === 'bridge')!.z).toBeCloseTo(.55);
  expect(input).toEqual(before);
});

it('keeps single-layer strength restrictions while permitting verified upper tiers', () => {
  const item: CargoItem = { id: 'A', name: 'A', length: 1.1, width: 1.1, height: .2,
    weightKg: 1, quantity: 3, maxStackLayers: 3, maxTopLoadKg: 100 };
  const verified = packOnPallets(container, [item], spec);
  const unknown = packOnPallets(container, [{ ...item, strengthUnverified: true }], spec);
  expect(verified.palletCount).toBe(1);
  expect(unknown.palletCount).toBe(3);
  expect(unknown.placements).toHaveLength(3);
  expect(unknown.placements.every(p => p.z === spec.height)).toBe(true);
});
