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
