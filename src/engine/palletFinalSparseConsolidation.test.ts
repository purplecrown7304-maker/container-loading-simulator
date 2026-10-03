import { expect, it } from 'vitest';
import { consolidateFinalSparsePallets, defaultPalletSpec, type PalletLoad, type PalletPackingResult } from './palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 4, width: 1.1, height: 2.2, maxPayloadKg: 10000 };
const pallet = { ...defaultPalletSpec, length: 1.1, width: 1.1, maxLoadKg: 1000, maxStackLevels: 2 };
const item = (id: string, weightKg: number, unloadPriority = 1): CargoItem => ({
  id, name: id, length: .5, width: .5, height: .2, weightKg, quantity: 1,
  maxStackLayers: 6, maxTopLoadKg: 1000, allowRotation: false, unloadPriority,
});
const placement = (cargo: CargoItem, x: number, y: number, z: number): Placement => ({
  cargoId: cargo.id, x, y, z,
  length: cargo.length, width: cargo.width, height: cargo.height,
  weightKg: cargo.weightKg, rotated: false,
});
const load = (
  palletIndex: number,
  stackColumn: number,
  stackLevel: number,
  x: number,
  z: number,
  cargo: CargoItem,
  mixed = false,
): PalletLoad => {
  const box = placement(cargo, x, 0, z + pallet.height);
  return {
    palletIndex, stackColumn, stackLevel, x, y: 0, z,
    length: pallet.length, width: pallet.width, height: pallet.height,
    cargoPlacements: [box], cargoWeightKg: cargo.weightKg,
    packagingWeightKg: 0, packagingExtraHeightM: 0,
    cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: cargo.weightKg + pallet.tareWeightKg,
    centerOfGravity: { x: x + pallet.length / 2, y: pallet.width / 2, z: z + pallet.height + cargo.height / 2 },
    isMixedTail: mixed || undefined,
  };
};

it('merges a sparse stacked tail into a compatible sparse floor pallet before shipping another base', () => {
  const a = item('A', 60);
  const b = item('B', 40);
  const baseCargo = item('BASE', 300);
  const target = load(1, 1, 1, 0, 0, a, true);
  const lower = load(2, 2, 1, 1.2, 0, baseCargo);
  const source = load(3, 2, 2, 1.2, .35, b, true);
  const input: PalletPackingResult = {
    pallets: [target, lower, source],
    placements: [target, lower, source].flatMap(row => row.cargoPlacements),
    remaining: [],
    palletCount: 3,
    loadedCargoWeightKg: 400,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: target.totalWeightKg + lower.totalWeightKg + source.totalWeightKg,
    consolidatedPallets: 0,
    lateralImbalanceKg: 0,
    stackedPallets: 1,
    maxUsedStackLevel: 2,
  };

  const compacted = consolidateFinalSparsePallets(input, container, [a, b, baseCargo], pallet, 'capacity');
  expect(compacted.passes).toBe(1);
  expect(compacted.result.palletCount).toBe(2);
  expect(compacted.result.placements).toHaveLength(3);
  const merged = compacted.result.pallets.find(row => row.stackColumn === 1)!;
  expect(merged.stackLevel).toBe(1);
  expect(merged.cargoWeightKg).toBe(100);
  expect(new Set(merged.cargoPlacements.map(box => box.cargoId))).toEqual(new Set(['A', 'B']));
  expect(merged.cargoWeightKg).toBeLessThanOrEqual(pallet.maxLoadKg);
});

it('does not merge sparse pallets from different unload stops', () => {
  const a = item('A', 60, 1);
  const b = item('B', 40, 2);
  const target = load(1, 1, 1, 0, 0, a, true);
  const source = load(2, 2, 1, 1.2, 0, b, true);
  const input: PalletPackingResult = {
    pallets: [target, source],
    placements: [target, source].flatMap(row => row.cargoPlacements),
    remaining: [],
    palletCount: 2,
    loadedCargoWeightKg: 100,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: target.totalWeightKg + source.totalWeightKg,
    consolidatedPallets: 0,
    lateralImbalanceKg: 0,
    stackedPallets: 0,
    maxUsedStackLevel: 1,
  };

  const compacted = consolidateFinalSparsePallets(input, container, [a, b], pallet, 'unloading');
  expect(compacted.passes).toBe(0);
  expect(compacted.result.palletCount).toBe(2);
});


it('merges the live-like 111 kg regular pallet and 85 kg mixed tail into one dense pallet', () => {
  const large: CargoItem = {
    id: 'PKG-PRD-030', name: 'large no-stack carton',
    length: .235, width: .31, height: .265, weightKg: 7.2, quantity: 14,
    maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true, unloadPriority: 1,
  };
  const small: CargoItem = {
    id: 'TAIL-SMALL', name: 'small tail carton',
    length: .235, width: .13, height: .265, weightKg: 11.3, quantity: 4,
    maxStackLayers: 10, maxTopLoadKg: 100, allowRotation: true, unloadPriority: 1,
  };
  const make = (palletIndex: number, x: number, items: Array<{ cargo: CargoItem; px: number; py: number }>, mixed = false): PalletLoad => {
    const cargoPlacements = items.map(({ cargo, px, py }) => placement(cargo, x + px, py, pallet.height));
    const cargoWeightKg = cargoPlacements.reduce((sum, box) => sum + box.weightKg, 0);
    return {
      palletIndex, stackColumn: palletIndex, stackLevel: 1, x, y: 0, z: 0,
      length: pallet.length, width: pallet.width, height: pallet.height,
      cargoPlacements, cargoWeightKg, packagingWeightKg: 0, packagingExtraHeightM: 0,
      cornerGuardsUsed: false, wrappingUsed: false,
      totalWeightKg: cargoWeightKg + pallet.tareWeightKg,
      centerOfGravity: { x: x + pallet.length / 2, y: pallet.width / 2, z: pallet.height + large.height / 2 },
      isMixedTail: mixed || undefined,
    };
  };

  const regularItems: Array<{ cargo: CargoItem; px: number; py: number }> = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) regularItems.push({ cargo: large, px: col * .235, py: row * .31 });
  }
  const tailItems = [
    { cargo: large, px: 0, py: 0 },
    { cargo: large, px: .235, py: 0 },
    { cargo: small, px: 0, py: .31 },
    { cargo: small, px: .235, py: .31 },
    { cargo: small, px: .47, py: .31 },
    { cargo: small, px: .705, py: .31 },
  ];
  const regular = make(1, 0, regularItems, false);
  const tail = make(2, 1.2, tailItems, true);
  expect(regular.totalWeightKg).toBeCloseTo(111.4, 6);
  expect(tail.totalWeightKg).toBeCloseTo(84.6, 6);

  const input: PalletPackingResult = {
    pallets: [regular, tail],
    placements: [regular, tail].flatMap(row => row.cargoPlacements),
    remaining: [],
    palletCount: 2,
    loadedCargoWeightKg: regular.cargoWeightKg + tail.cargoWeightKg,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: regular.totalWeightKg + tail.totalWeightKg,
    consolidatedPallets: 0,
    lateralImbalanceKg: 0,
    stackedPallets: 0,
    maxUsedStackLevel: 1,
  };

  const compacted = consolidateFinalSparsePallets(input, container, [large, small], pallet, 'capacity');
  expect(compacted.passes).toBe(1);
  expect(compacted.result.palletCount).toBe(1);
  expect(compacted.result.placements).toHaveLength(18);
  expect(compacted.result.pallets[0].cargoWeightKg).toBeCloseTo(146, 6);
  expect(compacted.result.pallets[0].totalWeightKg).toBeLessThanOrEqual(pallet.maxLoadKg + pallet.tareWeightKg);
  expect(compacted.result.pallets[0].isMixedTail).toBeUndefined();
});

it('keeps a genuinely sparse top tier separate instead of undoing the 50% top-fill rule', () => {
  const box = item('TOP-FILL', 10);
  const regularItems = Array.from({ length: 8 }, (_, index) => placement(
    box,
    (index % 4) * .5,
    Math.floor(index / 4) * .5,
    pallet.height + Math.floor(index / 4) * .2,
  ));
  const regular: PalletLoad = {
    palletIndex: 1, stackColumn: 1, stackLevel: 1, x: 0, y: 0, z: 0,
    length: pallet.length, width: pallet.width, height: pallet.height,
    cargoPlacements: regularItems, cargoWeightKg: 80,
    packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: 80 + pallet.tareWeightKg,
    centerOfGravity: { x: .55, y: .55, z: .35 },
  };
  const tail = load(2, 2, 1, 1.2, 0, box, true);
  const input: PalletPackingResult = {
    pallets: [regular, tail], placements: [...regular.cargoPlacements, ...tail.cargoPlacements],
    remaining: [], palletCount: 2, loadedCargoWeightKg: 90, totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0, packagedPalletCount: 0,
    totalPalletizedWeightKg: regular.totalWeightKg + tail.totalWeightKg,
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
  };
  const compacted = consolidateFinalSparsePallets(input, container, [{ ...box, quantity: 9 }], pallet, 'capacity');
  expect(compacted.passes).toBe(0);
  expect(compacted.result.palletCount).toBe(2);
});
