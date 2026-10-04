import { itemCg } from '../load-sim';
import { bPlacementToLoadSim } from '../rule-engine/loadSimAdapter';
import { publishLoadSimAcceptance } from '../rule-engine/acceptance';
import { describe, expect, it } from 'vitest';
import { loadContainerWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { movePreparedPallet, palletResultToLoadingResult, palletUnitHeight } from './palletContainerPlacement';
import type { PalletLoad } from './palletPacking';
import type { CargoItem } from './types';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 5000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 12, maxStackLayers: 2 }];

describe('A-only rigid pallet container loading', () => {
  it('uses exactly A placements and final validation for prepared gross units', () => {
    const result = packOnPallets(container, cargo, { ...defaultPalletSpec, useWrapping: true, useCornerGuards: true, minimizePackaging: false });
    const input = result.ruleEngineInput!;
    expect(input).toBeDefined();
    expect(result.palletCount).toBeGreaterThan(0);
    expect(input.placements).toEqual(loadContainerWithLoadSim(container, input.cargo).placements);
    expect(validateExistingWithLoadSim(container, input.cargo, input.placements).validation.ok).toBe(true);
    expect(input.cargo.every(item => item.loadSimType === 'pallet' && item.unitKind === 'pallet')).toBe(true);
    expect(input.cargo.every(item => item.floorOnly === undefined && item.allowRotation === undefined)).toBe(true);
    for (const mapping of input.palletUnits) {
      const load = result.pallets.find(p => p.palletIndex === mapping.displayPalletIndex)!;
      const unit = input.placements.find(p => p.cargoId === mapping.cargoId)!;
      expect(unit.height).toBeCloseTo(palletUnitHeight(load), 9);
      expect(unit.weightKg).toBeCloseTo(load.cargoWeightKg + defaultPalletSpec.tareWeightKg + load.packagingWeightKg, 9);
      expect(mapping.displayPlacementIndexes?.map(i => result.placements[i])).toEqual(load.cargoPlacements);
      for (const child of load.cargoPlacements) {
        expect(child.x).toBeGreaterThanOrEqual(unit.x - 1e-6);
        expect(child.y).toBeGreaterThanOrEqual(unit.y - 1e-6);
        expect(child.z).toBeGreaterThanOrEqual(unit.z + load.height - 1e-6);
        expect(child.x + child.length).toBeLessThanOrEqual(unit.x + unit.length + 1e-6);
        expect(child.y + child.width).toBeLessThanOrEqual(unit.y + unit.width + 1e-6);
        expect(child.z + child.height).toBeLessThanOrEqual(unit.z + unit.height + 1e-6);
      }
    }
    const loading = palletResultToLoadingResult(result);
    expect(loading.ruleEngineInput).toBe(input);
    expect(loading.loadedWeightKg).toBe(result.totalPalletizedWeightKg);
    expect(loading.loadedWeightKg).toBe(input.placements.reduce((sum, p) => sum + p.weightKg, 0));
    expect(result.placements.length + result.remaining.reduce((sum, p) => sum + p.quantity, 0)).toBe(12);
  });

  it('publishes an accepted final proof for the rendered children and rigid units together', () => {
    const result = packOnPallets(container, cargo);
    const supports = result.pallets.map(load => ({ id: `PALLET-${String(load.palletIndex).padStart(2, '0')}`, x: load.x, y: load.y, z: load.z, length: load.length, width: load.width, height: load.height, weightKg: load.totalWeightKg - load.cargoWeightKg }));
    const target = { mode: 'pallets' as const, container, cargo, result: palletResultToLoadingResult(result), supports };
    expect(publishLoadSimAcceptance(target).status).toBe('accepted');
    const changed = structuredClone(target);
    changed.result.placements[0].x += 50;
    expect(publishLoadSimAcceptance(changed).status).toBe('rejected');
  });

  it('rejects altered pallet snapshot geometry and weights before restoration or reports', () => {
    const result = packOnPallets(container, cargo);
    expect(palletResultToLoadingResult(result).validationIssues).toEqual([]);
    const restored = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(palletResultToLoadingResult(restored).validationIssues).toEqual([]);
    expect(publishLoadSimAcceptance({ mode: 'pallets', container, cargo, result: palletResultToLoadingResult(restored) }).status).toBe('accepted');
    for (const mutate of [
      (changed: typeof result) => { changed.pallets[0].x = 100; },
      (changed: typeof result) => { changed.palletCount = 99; },
      (changed: typeof result) => { changed.totalPalletizedWeightKg = 1; },
      (changed: typeof result) => { changed.loadedCargoWeightKg = 1; },
      (changed: typeof result) => { changed.totalPackagingWeightKg = 99; },
      (changed: typeof result) => { changed.packagedPalletCount = 99; },
      (changed: typeof result) => { changed.pallets[0].totalWeightKg += 1; },
      (changed: typeof result) => { changed.pallets[0].centerOfGravity.x += .1; },
      (changed: typeof result) => { changed.pallets[0].cargoPlacements[0].x += .01; },
      (changed: typeof result) => { delete changed.ruleEngineInput; },
    ]) {
      const changed = structuredClone(result);
      mutate(changed);
      expect(palletResultToLoadingResult(changed).validationIssues.some(issue => issue.type === 'INVALID_CARGO')).toBe(true);
    }
  });

  it('rejects reacceptance from stale source CG or moved/overlapping display children', () => {
    const result = packOnPallets(container, cargo);
    const target = { mode: 'pallets' as const, container, cargo, result: palletResultToLoadingResult(result) };
    expect(publishLoadSimAcceptance(target).status).toBe('accepted');
    const moved = structuredClone(target);
    moved.result.placements[0].x += .001;
    expect(publishLoadSimAcceptance(moved).status).toBe('rejected');
    const overlapping = structuredClone(target);
    overlapping.result.placements[0] = { ...overlapping.result.placements[1] };
    expect(publishLoadSimAcceptance(overlapping).status).toBe('rejected');
    const sourceChanged = structuredClone(target);
    sourceChanged.cargo[0].cgOffsetM = { l: .1, w: .2, h: .3 };
    expect(publishLoadSimAcceptance(sourceChanged).status).toBe('rejected');
    const canonicalChanged = structuredClone(target);
    canonicalChanged.result.ruleEngineInput!.cargo[0].cgOffsetM!.l += .01;
    expect(publishLoadSimAcceptance(canonicalChanged).status).toBe('rejected');
    const rigidMoved = structuredClone(target);
    rigidMoved.result.ruleEngineInput!.placements[0].x += .001;
    expect(publishLoadSimAcceptance(rigidMoved).status).toBe('rejected');
  });

  it('preserves explicit child rotation restrictions on the entire rigid unit', () => {
    const result = packOnPallets(container, [{ ...cargo[0], allowRotation: false }]);
    expect(result.ruleEngineInput!.cargo.every(unit => JSON.stringify(unit.allowedOrientations) === JSON.stringify(['LWH']))).toBe(true);
    expect(result.ruleEngineInput!.placements.every(unit => unit.loadSimOrientation === 'LWH')).toBe(true);
  });

  it('keeps explicit stops and handling metadata distinct through preparation', () => {
    const input = [
      { ...cargo[0], id: 'FIRST', quantity: 1, unloadPriority: 1, segregationClass: 'dry', tempZone: 'ambient' },
      { ...cargo[0], id: 'SECOND', quantity: 1, unloadPriority: 2, segregationClass: 'cold', tempZone: 'cold' },
    ];
    const result = packOnPallets(container, input);
    expect(result.ruleEngineInput!.cargo).toHaveLength(2);
    expect(result.ruleEngineInput!.cargo.map(unit => [unit.unloadPriority, unit.segregationClass, unit.tempZone])).toEqual([[1, 'dry', 'ambient'], [2, 'cold', 'cold']]);
    expect(result.pallets.every(load => new Set(load.cargoPlacements.map(p => p.cargoId)).size === 1)).toBe(true);
  });

  it('keeps asymmetric source CG offsets through child rotation and whole-pallet rotation', () => {
    const space = { length: 1.1, width: 1.4, height: 1.5, maxPayloadKg: 5000 };
    const input = [{ ...cargo[0], length: .4, width: .6, quantity: 4, maxStackLayers: 1, cgOffsetM: { l: .09, w: -.02, h: .03 } }];
    const spec = { ...defaultPalletSpec, length: 1.2, width: .8, maxStackLevels: 1, useCornerGuards: true, useWrapping: true, minimizePackaging: false };
    const result = packOnPallets(space, input, spec);
    expect(result.placements).toHaveLength(4);
    const load = result.pallets[0];
    const canonical = result.ruleEngineInput!;
    const unit = canonical.placements[0];
    const source = canonical.cargo.find(row => row.id === unit.cargoId)!;
    expect(unit.loadSimOrientation).toBe('WLH');
    // Preparation rotated each carton; A then rotated the complete pallet, undoing the carton permutation.
    expect(load.cargoPlacements.every(child => child.loadSimOrientation === 'LWH')).toBe(true);
    const mass = input[0].weightKg * 4 + spec.tareWeightKg + spec.cornerGuardWeightKg + spec.wrappingWeightKg;
    expect(source.weightKg).toBe(mass);
    expect(load.totalWeightKg).toBe(mass);
    const parts = load.cargoPlacements.map(child => {
      const cg = itemCg(bPlacementToLoadSim(child, input[0]));
      return { weight: child.weightKg, x: cg.x / 1000, y: cg.y / 1000, z: cg.z / 1000 };
    });
    const top = Math.max(...load.cargoPlacements.map(child => child.z + child.height));
    parts.push(
      { weight: spec.tareWeightKg, x: load.x + load.length / 2, y: load.y + load.width / 2, z: load.z + load.height / 2 },
      { weight: load.packagingWeightKg, x: load.x + load.length / 2, y: load.y + load.width / 2, z: top + load.packagingExtraHeightM / 2 },
    );
    const canonicalCg = itemCg(bPlacementToLoadSim(unit, source));
    for (const axis of ['x', 'y', 'z'] as const) {
      const expected = parts.reduce((sum, part) => sum + part.weight * part[axis], 0) / mass;
      expect(canonicalCg[axis] / 1000).toBeCloseTo(expected, 10);
      expect(load.centerOfGravity[axis]).toBeCloseTo(expected, 10);
    }
    const geometricX = (load.cargoPlacements.reduce((sum, child) => sum + child.weightKg * (child.x + child.length / 2), 0)
      + (spec.tareWeightKg + load.packagingWeightKg) * (load.x + load.length / 2)) / mass;
    expect(load.centerOfGravity.x - geometricX).toBeCloseTo(.09 * 40 / mass, 10);
    const supports = [{ id: 'PALLET-01', x: load.x, y: load.y, z: load.z, length: load.length, width: load.width, height: load.height, weightKg: spec.tareWeightKg + load.packagingWeightKg }];
    expect(publishLoadSimAcceptance({ mode: 'pallets', container: space, cargo: input, result: palletResultToLoadingResult(result), supports }).status).toBe('accepted');
  });

  it('retains A margins instead of a zero-clearance legacy exact-fit fallback', () => {
    const exact = { length: 1.1, width: 1.1, height: 1.5, maxPayloadKg: 5000 };
    const result = packOnPallets(exact, [{ ...cargo[0], quantity: 1 }]);
    expect(result.palletCount).toBe(0);
    expect(result.remaining.reduce((sum, p) => sum + p.quantity, 0)).toBe(1);
    expect(result.ruleEngineInput?.placements).toEqual(loadContainerWithLoadSim(exact, result.ruleEngineInput!.cargo).placements);
  });

  it('lets A rotate a non-square pallet as one upright unit when that is the only fit', () => {
    const space = { length: 1.1, width: 1.4, height: 1.5, maxPayloadKg: 5000 };
    const input = [{ ...cargo[0], length: .6, width: .4, quantity: 4, maxStackLayers: 1 }];
    const spec = { ...defaultPalletSpec, length: 1.2, width: .8, maxStackLevels: 1 };
    const result = packOnPallets(space, input, spec);
    expect(result.placements).toHaveLength(4);
    expect(result.ruleEngineInput?.placements[0].loadSimOrientation).toBe('WLH');
    expect(result.pallets[0]).toMatchObject({ length: .8, width: 1.2 });
    expect(validateExistingWithLoadSim(space, result.ruleEngineInput!.cargo, result.ruleEngineInput!.placements).validation.ok).toBe(true);
    const fixed = packOnPallets(space, [{ ...input[0], allowRotation: false }], spec);
    expect(fixed.placements).toEqual([]);
    expect(fixed.remaining.reduce((sum, p) => sum + p.quantity, 0)).toBe(4);
  });

  it('allows A pallet stacking under declared limits instead of injecting floor-only defaults', () => {
    const space = { length: 1.3, width: 1.3, height: 1.8, maxPayloadKg: 5000 };
    const input = [{ ...cargo[0], length: .5, width: .5, quantity: 8, maxStackLayers: 1 }];
    const spec = { ...defaultPalletSpec, length: 1, width: 1, maxLoadKg: 40, maxStackLevels: 2 };
    const result = packOnPallets(space, input, spec);
    expect(result.palletCount).toBe(2);
    expect(result.stackedPallets).toBe(1);
    expect(result.ruleEngineInput!.cargo.every(unit => unit.floorOnly === undefined)).toBe(true);
    expect(result.totalPalletizedWeightKg).toBe(130);
    expect(validateExistingWithLoadSim(space, result.ruleEngineInput!.cargo, result.ruleEngineInput!.placements).validation.ok).toBe(true);
  });

  it('transforms every child and its center of gravity with the upright rigid permutation', () => {
    const source: PalletLoad = {
      palletIndex: 1, x: 3, y: 4, z: .2, length: 1.2, width: .8, height: .15,
      stackLevel: 1, stackColumn: 1,
      cargoPlacements: [{ cargoId: 'A', x: 3.2, y: 4.1, z: .35, length: .6, width: .4, height: .3, weightKg: 10, rotated: false }],
      cargoWeightKg: 10, packagingWeightKg: 0, packagingExtraHeightM: 0,
      cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 35,
      centerOfGravity: { x: 3.5, y: 4.3, z: .42 },
    };
    const moved = movePreparedPallet(source, { cargoId: 'rigid', x: 1, y: 2, z: .5, length: .8, width: 1.2, height: .45, weightKg: 35, loadSimOrientation: 'WLH' }, 2);
    expect(moved).toMatchObject({ length: .8, width: 1.2, palletIndex: 2 });
    expect(moved.cargoPlacements[0].x).toBeCloseTo(1.1);
    expect(moved.cargoPlacements[0].y).toBeCloseTo(2.2);
    expect(moved.cargoPlacements[0].z).toBeCloseTo(.65);
    expect(moved.cargoPlacements[0]).toMatchObject({ length: .4, width: .6, loadSimOrientation: 'WLH', rotated: true });
    expect(moved.centerOfGravity.x).toBeCloseTo(1.3);
    expect(moved.centerOfGravity.y).toBeCloseTo(2.5);
    expect(moved.centerOfGravity.z).toBeCloseTo(.72);
    expect(source.x).toBe(3);
  });
});
