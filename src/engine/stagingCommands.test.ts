import { describe, expect, it, vi } from 'vitest';
import { assessStagingAddition, assessStagingRestore, assessStagingWithdrawal, findStagingLoadingPosition, rebuildStagingPalletResult, type StagingCommandContext } from './stagingCommands';
import type { StagingUnit } from '../stagingInventory';
import { defaultSecuringMaterialSettings } from '../securingMaterialSettings';
import { defaultPalletSpec, type PalletLoad, type PalletSpec } from './palletPacking';
import type { MixedModePackingResult } from './mixedModePacking';
import type { CargoItem, LoadingResult, Placement } from './types';

const item: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: .5, weightKg: 20, quantity: 3, maxStackLayers: 4, maxTopLoadKg: 500 };
const empty = (): LoadingResult => ({ placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] });
const placement = (id: string, x = 1.5, z = 0): Placement => ({ cargoId: 'A', unitId: id, x, y: .5, z, length: 1, width: 1, height: .5, weightKg: 20 });
function box(id: string, location: StagingUnit['location'] = 'yard', cargoId = 'A'): StagingUnit {
  return { id: `staging:${id}`, kind: 'box', name: cargoId, cargoId, cargoIds: [cargoId], length: 1, width: 1, height: .5, weightKg: 20, boxCount: 1,
    unloadPriorities: [], location, verdict: location === 'vehicle' ? 'placed' : 'pending', reasons: [], boxUnits: [{ id, cargoId, stableId: `staging:${id}` }] };
}
function context(placements: Placement[] = [], cargo = [item]): StagingCommandContext {
  return { container: { length: 4, width: 2, height: 2, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 10000 }, cargo,
    result: { ...empty(), placements, loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0), usedVolumeM3: placements.length * .5 },
    mode: 'boxes', materials: { ...defaultSecuringMaterialSettings } };
}
const spec: PalletSpec = { ...defaultPalletSpec, length: 1, width: 1, height: .15, tareWeightKg: 5, maxLoadKg: 500, maxStaticLoadKg: 1000, maxSupportedTopWeightKg: 1000, maxStackLevels: 2, useWrapping: false, useCornerGuards: false };
function pallet(id: string, wrapped = false): StagingUnit {
  const p: Placement = { ...placement(id, 0, .15), y: 0 };
  const load: PalletLoad = { palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1, length: 1, width: 1, height: .15,
    cargoPlacements: [p], cargoWeightKg: 20, packagingWeightKg: wrapped ? 1.5 : 0, packagingExtraHeightM: wrapped ? .01 : 0,
    cornerGuardsUsed: false, wrappingUsed: wrapped, totalWeightKg: wrapped ? 26.5 : 25, centerOfGravity: { x: .5, y: .5, z: .35 } };
  return { ...box(id), kind: 'pallet', id: `pallet:${id}`, pallet: load, palletSpec: spec, height: wrapped ? .66 : .65, weightKg: load.totalWeightKg };
}
function palletContext(placements: Placement[] = [], pallets: PalletLoad[] = []): StagingCommandContext { return { ...context(placements), mode: 'pallets', palletSpec: spec, pallets }; }
function loadedPallet(context: StagingCommandContext, unit: StagingUnit, z = 0) {
  const checked = assessStagingAddition(context, unit, { x: 1.5, y: .5, z });
  expect(checked.reasons).toEqual([]); expect(checked.valid).toBe(true);
  return { ...context, result: checked.result, pallets: checked.pallets };
}

describe('staging transfer commands', () => {
  it('adds one real waiting box, conserves quantity, preserves source data and asks to invalidate verification', () => {
    const source = context(); const before = JSON.stringify(source);
    const checked = assessStagingAddition(source, box('A:0'), { x: 1.5, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.valid).toBe(true); expect(checked.changed).toBe(true); expect(checked.invalidateVerification).toBe(true);
    expect(checked.result.placements).toEqual([{ ...placement('A:0'), orientation: 'LWH', rotated: false }]); expect(checked.result.loadedWeightKg).toBe(20); expect(checked.result.usedVolumeM3).toBe(.5);
    expect(checked.result.remaining).toEqual([{ cargoId: 'A', quantity: 2, reason: expect.any(String), reasonCode: 'STAGING_PENDING' }]);
    expect(checked.previous.result).toBe(source.result); expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects an already loaded identity, excess demand and allocation on another vehicle', () => {
    const source = context([placement('A:0')], [{ ...item, quantity: 1 }]);
    expect(assessStagingAddition(source, box('A:0'), { x: 0, y: .5, z: 0 }).reasons.join()).toContain('이미 차량');
    const excess = assessStagingAddition(source, box('A:1'), { x: 0, y: .5, z: 0 });
    expect(excess.valid).toBe(false); expect(excess.result).toBe(source.result); expect(excess.reasons.join()).toContain('수량');
    expect(assessStagingAddition(context(), box('A:2', 'other-vehicle'), { x: 0, y: .5, z: 0 }).valid).toBe(false);
    expect(assessStagingAddition({ ...context(), mode: 'pallets' }, { ...box('A:0'), requiresPackaging: true }, { x: 1.5, y: .5, z: 0 }).reasons).toContain('포장 계획 완료 후 상차할 수 있습니다.');
  });

  it('removes other-vehicle quantities from current waiting rows without charging their weight', () => {
    const source = { ...context(), assignedElsewhere: [{ id: 'A:2', cargoId: 'A' }] };
    const checked = assessStagingAddition(source, box('A:0'), { x: 1.5, y: .5, z: 0 });
    expect(checked.valid).toBe(true); expect(checked.result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(1); expect(checked.result.loadedWeightKg).toBe(20);
  });

  it('never clamps a negative or nonfinite yard drop into a valid vehicle placement', () => {
    for (const x of [-1, NaN, Infinity]) {
      const source = context(); const checked = assessStagingAddition(source, box('A:0'), { x, y: .5, z: 0 });
      expect(checked.valid).toBe(false); expect(checked.result).toBe(source.result); expect(checked.invalidateVerification).toBe(false);
    }
  });

  it('rejects collision, unsupported placement, forbidden rotation, floor load and strict unloading', () => {
    expect(assessStagingAddition(context([placement('A:0')]), box('A:1'), { x: 1.5, y: .5, z: 0 }).reasons.join()).toContain('충돌');
    expect(assessStagingAddition(context(), box('A:0'), { x: 1.5, y: .5, z: 1 }).reasons.join()).toContain('지지');
    const noRotation = context([], [{ ...item, allowRotation: false }]);
    expect(assessStagingAddition(noRotation, box('A:0'), { x: 1.5, y: .5, z: 0 }, true).valid).toBe(false);
    const floor = context(); floor.container.floorLoadLimitKgPerM2 = 10;
    expect(assessStagingAddition(floor, box('A:0'), { x: 1.5, y: .5, z: 0 }).reasons.join()).toContain('FLOOR_LOAD_LIMIT');
    const first = { ...item, id: 'FIRST', quantity: 1, unloadPriority: 1 }, later = { ...item, id: 'LATER', quantity: 1, unloadPriority: 2 };
    const stops = context([{ ...placement('FIRST:0', 0), cargoId: 'FIRST' }], [first, later]); stops.container.unloadingPolicy = 'strict';
    expect(assessStagingAddition(stops, box('LATER:0', 'yard', 'LATER'), { x: 3, y: .5, z: 0 }).reasons.join()).toContain('BLOCKS_UNLOAD_PATH');
  });

  it('includes required securing mass and retains an existing higher securing level', () => {
    const source = context(); source.container.maxPayloadKg = 21;
    expect(assessStagingAddition(source, box('A:0'), { x: 1.5, y: .5, z: 0 }).valid).toBe(false);
    const level3 = context(); level3.securingLevel = 3;
    const checked = assessStagingAddition(level3, box('A:0'), { x: 1.5, y: .5, z: 0 });
    expect(checked.valid).toBe(true); expect(checked.result.securingBudget?.level).toBe(3); expect(checked.result.securingBudget?.totalTransportWeightKg).toBeGreaterThan(20);
  });

  it('preserves review provenance and baseline errors while using only explicitly selected review values', () => {
    const source = context(); source.container.maxPayloadKg = 21; source.container.limitReview = { mode: 'what-if', maxPayloadKg: 100 };
    const checked = assessStagingAddition(source, box('A:0'), { x: 1.5, y: .5, z: 0 });
    expect(checked.valid).toBe(true); expect(checked.result.limitReview?.status).toBe('active'); expect(checked.result.validationIssues.some(issue => issue.type === 'PAYLOAD')).toBe(true);
    expect(checked.invalidateVerification).toBe(true); expect(source.container.maxPayloadKg).toBe(21);
  });

  it('uses A candidate/identity rules rather than accepting a disallowed orientation', () => {
    const source = context([], [{ ...item, length: 1, width: .5, allowedOrientations: ['LWH'] }]);
    source.container.rules = { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], source: 'test' };
    const unit = { ...box('A:0'), width: .5 };
    expect(assessStagingAddition(source, unit, { x: 1.5, y: .5, z: 0 }, true).valid).toBe(false);
  });

  it('rejects supporting lower-box withdrawal and restores a top box to waiting without changing input quantity', () => {
    const source = context([placement('A:0'), placement('A:1', 1.5, .5)]);
    const lower = assessStagingWithdrawal(source, box('A:0', 'vehicle'));
    expect(lower.valid).toBe(false); expect(lower.reasons.join()).toContain('하부'); expect(lower.result).toBe(source.result);
    const top = assessStagingWithdrawal(source, box('A:1', 'vehicle'));
    expect(top.reasons).toEqual([]); expect(top.result.placements.map(p => p.unitId)).toEqual(['A:0']); expect(top.result.loadedWeightKg).toBe(20); expect(top.result.usedVolumeM3).toBe(.5);
    expect(top.result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(2); expect(top.result.remaining.some(row => row.reasonCode === 'STAGING_WITHDRAWN')).toBe(true); expect(source.cargo[0].quantity).toBe(3);
  });

  it('preserves genuine engine failure reasons for the unplaced part of the same SKU', () => {
    const source = context([placement('A:0')]); source.result.remaining = [{ cargoId: 'A', quantity: 2, reason: 'explicit fixture floor failure', reasonCode: 'FLOOR_LOAD_LIMIT' }];
    const added = assessStagingAddition(source, box('A:1'), { x: 0, y: .5, z: 0 });
    expect(added.valid).toBe(true); expect(added.result.remaining).toEqual([{ cargoId: 'A', quantity: 1, reason: 'explicit fixture floor failure', reasonCode: 'FLOOR_LOAD_LIMIT' }]);
  });

  it('uses the explicit current unloading strategy for conflict provenance without changing loading priority', () => {
    const first = { ...item, id: 'FIRST', quantity: 1, weightKg: 30, unloadPriority: 1 };
    const later = { ...item, id: 'LATER', quantity: 1, weightKg: 10, unloadPriority: 2 };
    const source = context([{ ...placement('FIRST:0', 3), cargoId: 'FIRST', weightKg: 30 }], [first, later]);
    source.strategy = 'unloading';
    const checked = assessStagingAddition(source, box('LATER:0', 'yard', 'LATER'), { x: 0, y: .5, z: 0 });
    expect(checked.valid).toBe(true);
    expect(checked.result.operationalFindings?.some(f => f.code === 'HEAVY_INNER_UNLOAD_CONFLICT')).toBe(true);
    expect(checked.result.placements[0].unitId).toBe('FIRST:0');
  });

  it('finds a deterministic valid EMS position and returns no guessed outside position when full', () => {
    const source = context(); const before = JSON.stringify(source);
    const first = findStagingLoadingPosition(source, box('A:0')), second = findStagingLoadingPosition(source, box('A:0'));
    expect(first.valid).toBe(true); expect(first.candidate).toEqual(second.candidate); expect(JSON.stringify(source)).toBe(before);
    const full = context([placement('A:0', 0), placement('A:1', 1)], [{ ...item, quantity: 3 }]); full.container.length = 2; full.container.height = .5; full.container.width = 1; full.result.placements = full.result.placements.map(p => ({ ...p, y: 0 }));
    expect(findStagingLoadingPosition(full, box('A:2')).valid).toBe(false);
  });

  it('moves a wrapped pallet as one unit, counts every physical mass once and returns all members on withdrawal', () => {
    const source = { ...palletContext(), palletSpec: { ...spec, useWrapping: true, wrappingWeightKg: 1.5, wrappingExtraHeightM: .01 } }; const unit = pallet('A:0', true); const before = JSON.stringify(unit);
    const added = assessStagingAddition(source, unit, { x: 1.5, y: .5, z: 0 });
    expect(added.reasons).toEqual([]); expect(added.valid).toBe(true); expect(added.pallets).toHaveLength(1); expect(added.result.placements[0]).toMatchObject({ unitId: 'A:0', x: 1.5, y: .5, z: .15 });
    expect(added.pallets[0]).toMatchObject({ wrappingUsed: true, packagingWeightKg: 1.5 }); expect(added.result.loadedWeightKg).toBe(26.5); expect(added.result.securingBudget!.totalTransportWeightKg).toBeGreaterThan(26.5); expect(JSON.stringify(unit)).toBe(before);
    const current = { ...source, result: added.result, pallets: added.pallets };
    expect(assessStagingWithdrawal(current, { ...box('A:0', 'vehicle') }).valid).toBe(false);
    const removed = assessStagingWithdrawal(current, { ...unit, location: 'vehicle', pallet: added.pallets[0] });
    expect(removed.reasons).toEqual([]); expect(removed.pallets).toEqual([]); expect(removed.result.placements).toEqual([]); expect(removed.result.loadedWeightKg).toBe(0); expect(removed.result.securingBudget?.requiredWeightKg).toBe(0);
  });

  it('checks full pallet stacking, rejects a loaded lower pallet and refuses unsupported or excessive stacks', () => {
    const first = pallet('A:0'); const current = loadedPallet(palletContext(), first);
    const upper = assessStagingAddition(current, pallet('A:1'), { x: 1.5, y: .5, z: .65 });
    expect(upper.reasons).toEqual([]); expect(upper.valid).toBe(true); expect(upper.pallets[1].stackLevel).toBe(2); expect(upper.pallets[1].palletIndex).not.toBe(upper.pallets[0].palletIndex);
    const stacked = { ...current, result: upper.result, pallets: upper.pallets };
    expect(assessStagingWithdrawal(stacked, { ...first, location: 'vehicle' }).valid).toBe(false);
    expect(assessStagingAddition(stacked, pallet('A:2'), { x: 1.5, y: .5, z: 1.3 }).valid).toBe(false);
    expect(assessStagingAddition(current, pallet('A:1'), { x: 0, y: .5, z: .65 }).valid).toBe(false);
    const noRating = { ...current, palletSpec: { ...spec, maxStaticLoadKg: undefined } };
    expect(assessStagingAddition(noRating, pallet('A:1'), { x: 1.5, y: .5, z: .65 }).valid).toBe(false);
  });

  it('rejects stale pallet packaging settings and does not accept loose identity labels for different contained cargo', () => {
    const source = palletContext();
    expect(assessStagingAddition(source, pallet('A:0', true), { x: 1.5, y: .5, z: 0 }).valid).toBe(false);
    const corrupt = pallet('A:0'); corrupt.boxUnits = [{ id: 'B:0', cargoId: 'B', stableId: 'B:0' }];
    const current = { ...source, cargo: [item, { ...item, id: 'B' }] };
    expect(assessStagingAddition(current, corrupt, { x: 1.5, y: .5, z: 0 }).valid).toBe(false);
  });

  it('rebuilds mixed summary and packaging totals without repacking or duplicating pallet boxes', () => {
    const unit = pallet('A:0'); const current = loadedPallet(palletContext(), unit);
    const direct = placement('A:1', 0);
    const result = { ...current.result, placements: [...current.result.placements, direct], loadedWeightKg: 45 };
    const source: MixedModePackingResult = { pallets: [], placements: [], remaining: [], palletCount: 0, loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 5, packagedPalletCount: 0, totalPalletizedWeightKg: 0, consolidatedPallets: 2, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 0,
      optimization: { selectedStackTarget: 1, candidateCount: 4, floorPositions: 0, redistributedForLowUtilization: false, consolidationPasses: 2 }, mixed: { enabled: true, directBoxCount: 0, directFloorBoxCount: 0, palletBoxCount: 0, palletCount: 0, demotedPalletCount: 2, candidateCount: 4, minPalletFillRatio: .7, totalLoadedWeightKg: 0, palletFillRates: [] } };
    const rebuilt = rebuildStagingPalletResult(source, result, current.pallets!, current.container);
    expect(rebuilt.mixed).toMatchObject({ directBoxCount: 1, palletBoxCount: 1, palletCount: 1, totalLoadedWeightKg: 45, demotedPalletCount: 2 });
    expect(rebuilt.loadedCargoWeightKg).toBe(40); expect(rebuilt.totalPalletizedWeightKg).toBe(25); expect(rebuilt.palletCount).toBe(1); expect(rebuilt.placements).toHaveLength(2); expect(source.pallets).toEqual([]);
  });

  it('performs no browser storage writes or result/certification publications', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent'); const writes = vi.spyOn(Storage.prototype, 'setItem');
    findStagingLoadingPosition(context(), box('A:0'));
    expect(dispatch).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); dispatch.mockRestore(); writes.mockRestore();
  });

  it('undo restores quantity and membership with current materials rather than a saved weight or PASS', () => {
    const source = context();
    const added = assessStagingAddition(source, box('A:0'), { x: 1.5, y: .5, z: 0 });
    const loaded = { ...source, result: added.result, pallets: added.pallets };
    const undone = assessStagingRestore(loaded, added.previous);
    expect(undone.valid).toBe(true); expect(undone.result.placements).toEqual([]); expect(undone.result.loadedWeightKg).toBe(0); expect(undone.result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(3); expect(undone.invalidateVerification).toBe(true);
    const current = context(); current.materials = { ...defaultSecuringMaterialSettings, antiSlipKgPerEa: 10, dunnageKgPerEa: 10 };
    const restored = assessStagingRestore(current, { result: { ...added.result, loadedWeightKg: 1, usedVolumeM3: 999 }, pallets: [] });
    expect(restored.valid).toBe(true); expect(restored.result.loadedWeightKg).toBe(20); expect(restored.result.usedVolumeM3).toBe(.5); expect(restored.result.securingBudget?.totalTransportWeightKg).toBe(60);
  });

  it('rejects saved floating loads, changed payload constraints and broken pallet membership on restore', () => {
    const saved = { result: { ...empty(), placements: [placement('A:0', 1.5, .5)] }, pallets: [] };
    expect(assessStagingRestore(context(), saved).valid).toBe(false);
    const loaded = loadedPallet(palletContext(), pallet('A:0'));
    const changed = { ...loaded, container: { ...loaded.container, maxPayloadKg: 10 } };
    expect(assessStagingRestore(changed, { result: loaded.result, pallets: loaded.pallets! }).valid).toBe(false);
    expect(assessStagingRestore(palletContext(), { result: empty(), pallets: loaded.pallets! }).valid).toBe(false);
  });

  it('never accepts a floating pallet restore because the same error already exists in the current result', () => {
    const current = loadedPallet(palletContext(), pallet('A:0'));
    const source = current.pallets![0];
    const floating = { ...source, z: source.z + .2,
      centerOfGravity: { ...source.centerOfGravity, z: source.centerOfGravity.z + .2 },
      cargoPlacements: source.cargoPlacements.map(p => ({ ...p, z: p.z + .2 })) };
    const invalid = { ...current, result: { ...current.result, placements: floating.cargoPlacements }, pallets: [floating] };
    const checked = assessStagingRestore(invalid, { result: invalid.result, pallets: invalid.pallets });
    expect(checked.valid).toBe(false); expect(checked.result).toBe(invalid.result);
    expect(checked.reasons.join()).toMatch(/지지|떠/);
  });

  it('does not restore loose boxes that bypass pallet-only or explicit mixed pallet packaging', () => {
    const previous = { result: { ...empty(), placements: [placement('A:0')] }, pallets: [] };
    expect(assessStagingRestore(palletContext(), previous).valid).toBe(false);
    const mixed = { ...context([], [{ ...item, mixedLoadingMethod: 'pallet' as const }]), mode: 'mixed' as const, palletSpec: spec };
    expect(assessStagingRestore(mixed, previous).valid).toBe(false);
    expect(assessStagingRestore({ ...mixed, cargo: [item] }, previous).valid).toBe(true);
  });
});
