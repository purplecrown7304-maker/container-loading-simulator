import { describe, expect, it } from 'vitest';
import { expandCargoToLoadSim, bPlacementToLoadSim } from './loadSimAdapter';
import { canPlaceWithLoadSim, loadContainerWithLoadSim, validateExistingWithLoadSim, validatePlacementsWithLoadSim } from './loadSimEngine';
import { assessManualMove } from '../engine/manualPlacement';
import { preflightCargoInput } from '../engine/inputPreflight';
import { loadContainer } from '../engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from '../engine/types';
const space: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
const item = (patch: Partial<CargoItem> = {}): CargoItem => ({ id: 'A', name: 'A', length: .4, width: .2, height: .3, quantity: 1, weightKg: 10, ...patch });
const at = (cargo: CargoItem, patch: Partial<Placement> = {}): Placement => ({ cargoId: cargo.id, x: .8, y: .9, z: 0, length: cargo.length, width: cargo.width, height: cargo.height, weightKg: cargo.weightKg, ...patch });
const result = (placements: Placement[]): LoadingResult => ({ placements, remaining: [], loadedWeightKg: 10, usedVolumeM3: .024, validationIssues: [], ruleEngine: 'load-sim' });

describe('A-only migration boundaries', () => {
  it('uses native A type defaults and respects explicit orientation restrictions', () => {
    expect(expandCargoToLoadSim([item()]).items[0].allowedOrientations).toBeUndefined();
    expect(expandCargoToLoadSim([item({ allowRotation: false })]).items[0].allowedOrientations).toEqual(['LWH']);
  });
  it('preserves units, CG offsets, demand metadata and exact input weight', () => {
    const row = item({ quantity: 2, unitsPerPackage: 8, demandUnits: 8, cgOffsetM: { l: .01, w: -.02, h: .03 }, maxTopLoadKg: 0 });
    const expanded = expandCargoToLoadSim([row]);
    expect(expanded.items.map(i => i.id)).toEqual(['A#000001','A#000002']);
    const restored = bPlacementToLoadSim(at(row), row);
    expect(restored.item.cgOffset).toEqual({ l: 10, w: -20, h: 30 });
    expect(restored.item.maxTopLoad).toBe(0); expect(restored.item.weight).toBe(10);
    expect(expanded.context.byCargoId.get('A')?.demandUnits).toBe(8);
  });
  it('validates actual footprint against exact orientation metadata', () => {
    const row = item({ length: .8, width: .4 });
    expect(validateExistingWithLoadSim(space, [row], [at(row, { length: .4, width: .8, loadSimOrientation: 'LWH' })]).validationIssues.some(v => v.type === 'INVALID_CARGO')).toBe(true);
  });
  it('updates the exact orientation on manual horizontal rotation', () => {
    const row = item(), source = result([at(row, { loadSimOrientation: 'LWH' })]);
    const moved = assessManualMove(space, [row], source, 0, { x: .9, y: .8, z: 0 }, true);
    expect(moved.candidate.loadSimOrientation).toBe('WLH');
    expect(moved.result.validationIssues).toEqual([]);
  });
  it.each(['x','y','z','weightKg','length'] as const)('rejects nonfinite placement %s at every public boundary', key => {
    const row = item(), invalid = at(row, { [key]: NaN });
    expect(validatePlacementsWithLoadSim(space, [row], [invalid]).ok).toBe(false);
    expect(canPlaceWithLoadSim(space, [row], [], invalid)).not.toEqual([]);
  });
  it('rejects unknown identities and excess quantity', () => {
    const row = item();
    expect(canPlaceWithLoadSim(space, [row], [], at(row, { cargoId: 'UNKNOWN' }))).not.toEqual([]);
    expect(canPlaceWithLoadSim(space, [row], [at(row)], at(row, { x: .1 })).some(v => v.code === 'INPUT_QUANTITY')).toBe(true);
  });
  it.each([{ thisSideUp: true }, { floorOnly: true }, { tempZone: 'cold' }, { cgOffsetM: { l: .1, w: 0, h: 0 } }, { friction: .7 }])('rejects duplicate SKU safety conflicts %j', patch => {
    const checked = preflightCargoInput([item(), item(patch)]);
    expect(checked.cargo).toEqual([]); expect(checked.rejected[0].quantity).toBe(2);
  });
  it.each([{ friction: NaN }, { maxTopPressureKgPerM2: NaN }, { cgOffsetM: { l: NaN, w: 0, h: 0 } }])('rejects invalid safety input %j', patch => {
    const packed = loadContainerWithLoadSim(space, [item(patch)]);
    expect(packed.placements).toEqual([]); expect(packed.remaining[0].quantity).toBe(1);
  });
  it('rejects invalid axle input instead of assuming example data', () => {
    const invalid = { ...space, axles: { frontX: 0, rearX: 0, emptyFront: 100, emptyRear: 100, maxFront: 500, maxRear: 500, rearAxleCount: 1, maxGross: 1000 } };
    expect(loadContainerWithLoadSim(invalid, [item()]).placements).toEqual([]);
  });
});

describe('only A semantics remain active', () => {
  it('uses A tier-from-floor semantics instead of the removed B chain-height rule', () => {
    const base = item({ id: 'BASE', length: 1, width: 1, height: .4, maxStackLayers: 1 });
    const top = item({ id: 'TOP', length: 1, width: 1, height: .4, maxStackLayers: 3 });
    expect(validateExistingWithLoadSim(space, [base, top], [at(base, { x: .5, y: .5 }), at(top, { x: .5, y: .5, z: .4 })]).validationIssues.some(v => v.type === 'STACK_LIMIT')).toBe(false);
  });
  it('uses A area-proportional bridge load instead of B full descendant duplication', () => {
    const base = item({ id: 'BASE', length: .5, width: 1, height: .4, quantity: 2, maxTopLoadKg: 60 });
    const top = item({ id: 'TOP', length: 1, width: 1, height: .4, weightKg: 100 });
    expect(validateExistingWithLoadSim(space, [base, top], [at(base, { x: .5, y: .5 }), at(base, { x: 1, y: .5 }), at(top, { x: .5, y: .5, z: .4 })]).validationIssues.some(v => v.type === 'TOP_LOAD')).toBe(false);
  });
  it('uses the supplied A 5mm contact tolerance', () => {
    const row = item({ length: 1, width: 1, height: .4, quantity: 2 });
    expect(validateExistingWithLoadSim(space, [row], [at(row, { x: .5, y: .5 }), at(row, { x: .5, y: .5, z: .403 })]).validationIssues.some(v => v.type === 'UNSUPPORTED')).toBe(false);
  });
  it('always runs A without a storage flag, conserves quantity and is deterministic', () => {
    const rows = [item({ quantity: 12, maxStackLayers: 1 })];
    const first = loadContainer(space, rows, { publish: false });
    expect(first).toEqual(loadContainer(space, rows, { publish: false }));
    expect(first).toEqual(loadContainerWithLoadSim(space, rows));
    expect(first.placements.length + first.remaining.reduce((sum, r) => sum + r.quantity, 0)).toBe(12);
    expect(first.ruleEngine).toBe('load-sim');
  });
});

it('preserves the actual category of after-stop axle and door-header errors', async () => {
  const { loadSimValidationType } = await import('./loadSimAdapter');
  expect(loadSimValidationType('AFTER_STOP_FRONT_AXLE_OVERLOAD')).toBe('PAYLOAD');
  expect(loadSimValidationType('AFTER_STOP_CG_OUTSIDE_SUPPORT')).toBe('UNSUPPORTED');
  expect(loadSimValidationType('DOOR_HEADER_CLEARANCE')).toBe('OUT_OF_BOUNDS');
});

it('never merges distinct package/product identities or loses product EA under one SKU', () => {
  const rows = [item({ productId: 'P1', unitsPerPackage: 8, contentWeightKg: 9 }), item({ productId: 'P2', unitsPerPackage: 2, contentWeightKg: 8 })];
  const checked = preflightCargoInput(rows);
  expect(checked.cargo).toEqual([]);
  expect(checked.rejected).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 2 })]);
  const packed = loadContainer(space, rows, { publish: false });
  expect(packed.placements).toEqual([]);
  expect(packed.remaining[0].quantity).toBe(2);
});

it.each([
  { unitsPerPackage: 2 }, { productId: 'P2' }, { productName: 'changed' },
  { boxId: 'BOX2' }, { boxName: 'changed' }, { contentWeightKg: 8 }, { sourcePalletIndex: 2 },
])('keeps incompatible source/package metadata separate by rejecting ambiguous SKU: %j', patch => {
  expect(preflightCargoInput([item(), item(patch)]).cargo).toEqual([]);
});

it('does not describe a search-budget miss as proven physical impossibility', () => {
  const packed = loadContainerWithLoadSim(space, [item()], { maxAttemptsPerItem: 0 });
  expect(packed.placements).toHaveLength(0);
  expect(packed.remaining[0].quantity).toBe(1);
  expect(packed.remaining[0].reason).toContain('탐색 한도');
  expect(packed.remaining[0].reason).toContain('물리적 적재 불가능을 뜻하지 않음');
});
