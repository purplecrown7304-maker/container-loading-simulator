import { describe, expect, it, vi } from 'vitest';
import { assessStagingAddition, assessStagingRelocation, assessStagingRestore, assessStagingWithdrawal, findStagingLoadingPosition, rebuildStagingPalletResult, type StagingCommandContext } from './stagingCommands';
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
function vehiclePallet(current: StagingCommandContext, index = 0): StagingUnit {
  const load = current.pallets![index];
  return { ...pallet(load.cargoPlacements[0].unitId!), id: 'vehicle-pallet:' + load.palletIndex, location: 'vehicle', verdict: 'placed',
    pallet: load, palletSpec: current.palletSpec, length: load.length, width: load.width,
    height: Math.max(load.height, ...load.cargoPlacements.map(p => p.z + p.height - load.z)) + load.packagingExtraHeightM,
    weightKg: load.totalWeightKg, boxCount: load.cargoPlacements.length,
    boxUnits: load.cargoPlacements.map(p => ({ id: p.unitId!, cargoId: p.cargoId, stableId: 'stable:' + p.unitId })) };
}
function relocationFixture() {
  const currentSpec = { ...spec, useWrapping: true, useCornerGuards: true, wrappingWeightKg: 1.5,
    wrappingExtraHeightM: .01, cornerGuardWeightKg: .2, cornerGuardExtraHeightM: .02 };
  const base = { ...palletContext(), container: { ...context().container, length: 6 }, palletSpec: currentSpec, securingLevel: 3 as const };
  const whole = pallet('A:0', true);
  whole.pallet = { ...whole.pallet!, cargoPlacements: [whole.pallet!.cargoPlacements[0], { ...whole.pallet!.cargoPlacements[0], unitId: 'A:1', z: .65 }],
    cargoWeightKg: 40, totalWeightKg: 46.7, packagingWeightKg: 1.7, packagingExtraHeightM: .03,
    cornerGuardsUsed: true, bandingPlan: { straps: 4, securingLevel: 3, wrapping: true, cornerGuards: true }, isMixedTail: true };
  whole.boxUnits.push({ id: 'A:1', cargoId: 'A', stableId: 'stable:A:1' });
  const shifted = (source: PalletLoad, x: number, index: number): PalletLoad => ({ ...source, x, y: .5, palletIndex: index, stackColumn: index,
    cargoPlacements: source.cargoPlacements.map(p => ({ ...p, x: p.x + x, y: p.y + .5 })),
    centerOfGravity: { ...source.centerOfGravity, x: source.centerOfGravity.x + x, y: source.centerOfGravity.y + .5 } });
  const pallets = [shifted(whole.pallet, 1.5, 1), shifted(pallet('A:2').pallet!, 4.5, 2)];
  const result = { ...empty(), placements: pallets.flatMap(load => load.cargoPlacements) };
  const checked = assessStagingRestore({ ...base, result, pallets }, { result, pallets }); expect(checked.reasons).toEqual([]);
  return { ...base, result: checked.result, pallets: checked.pallets };
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

describe('atomic in-vehicle staging relocation', () => {
  it('preserves the complete pallet, member order/IDs, local offsets, CG and actual packaging in one final plan', () => {
    const current = relocationFixture(), unit = vehiclePallet(current), before = JSON.stringify({ current, unit });
    const source = current.pallets[0], other = current.pallets[1];
    const checked = assessStagingRelocation(current, unit, { x: 1.8, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.valid).toBe(true); expect(checked.changed).toBe(true); expect(checked.invalidateVerification).toBe(true);
    expect(checked.unitId).toBe(unit.id); expect(checked.previous.result).toBe(current.result); expect(checked.previous.pallets).toBe(current.pallets);
    expect(checked.pallets.map(p => p.palletIndex)).toEqual(current.pallets.map(p => p.palletIndex)); expect(checked.pallets[1]).toBe(other);
    expect(checked.result.placements.map(p => p.unitId)).toEqual(current.result.placements.map(p => p.unitId));
    const moved = checked.pallets[0];
    expect(moved).toMatchObject({ x: 1.8, y: .5, z: 0, wrappingUsed: true, cornerGuardsUsed: true, isMixedTail: true,
      packagingWeightKg: 1.7, packagingExtraHeightM: .03, totalWeightKg: 46.7 });
    expect(moved.bandingPlan).toBe(source.bandingPlan);
    moved.cargoPlacements.forEach((p, index) => {
      expect(p.unitId).toBe(source.cargoPlacements[index].unitId);
      for (const axis of ['x', 'y', 'z'] as const) expect(p[axis] - moved[axis]).toBeCloseTo(source.cargoPlacements[index][axis] - source[axis]);
      expect(checked.result.placements[index]).toBe(p);
    });
    expect(moved.centerOfGravity.x - source.centerOfGravity.x).toBeCloseTo(.3);
    expect(moved.centerOfGravity.y).toBe(source.centerOfGravity.y); expect(moved.centerOfGravity.z).toBe(source.centerOfGravity.z);
    expect(checked.result.placements).toHaveLength(3); expect(checked.result.remaining).toEqual(current.result.remaining);
    expect(checked.result.loadedWeightKg).toBeCloseTo(current.result.loadedWeightKg); expect(checked.result.securingBudget?.level).toBe(3);
    expect(JSON.stringify({ current, unit })).toBe(before);
  });
  it('validates the final balanced plan rather than rejecting an invalid intermediate withdrawal CG', () => {
    const heavyItem = { ...item, quantity: 2, weightKg: 400 };
    const makeLoad = (id: string, x: number, index: number): PalletLoad => ({ ...pallet(id).pallet!, x, y: .5, palletIndex: index, stackColumn: index,
      cargoPlacements: [{ ...placement(id, x, .15), weightKg: 400 }], cargoWeightKg: 400, totalWeightKg: 405,
      centerOfGravity: { x: x + .5, y: 1, z: .35 } });
    const loads = [makeLoad('A:0', .5, 1), makeLoad('A:1', 2.5, 2)];
    let current: StagingCommandContext = { ...palletContext(), cargo: [heavyItem], container: { ...context().container, maxPayloadKg: 900 },
      pallets: loads, result: { ...empty(), placements: loads.flatMap(load => load.cargoPlacements) } };
    const restored = assessStagingRestore(current, { result: current.result, pallets: loads }); expect(restored.reasons).toEqual([]);
    current = { ...current, result: restored.result };
    const unit = vehiclePallet(current);
    expect(assessStagingWithdrawal(current, unit).reasons.join()).toContain('CG_LONGITUDINAL');
    const checked = assessStagingRelocation(current, unit, { x: .6, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.valid).toBe(true); expect(checked.result.placements).toHaveLength(2);
    expect(checked.result.operationalFindings?.some(f => f.severity === 'error')).toBe(false);
  });
  it('locks a lower pallet with dependent loads and keeps the entire original outcome on rejection', () => {
    const first = pallet('A:0'), current = loadedPallet(palletContext(), first);
    const added = assessStagingAddition(current, pallet('A:1'), { x: 1.5, y: .5, z: .65 }); expect(added.reasons).toEqual([]);
    const stacked = { ...current, result: added.result, pallets: added.pallets };
    const checked = assessStagingRelocation(stacked, vehiclePallet(stacked), { x: 0, y: .5, z: 0 });
    expect(checked.valid).toBe(false); expect(checked.reasons.join()).toContain('하부 파렛트');
    expect(checked.result).toBe(stacked.result); expect(checked.pallets).toBe(stacked.pallets); expect(checked.invalidateVerification).toBe(false);
  });
  it('rejects final collision, outside/nonfinite positions, unsupported height and packaging ceiling overflow', () => {
    const current = relocationFixture(), unit = vehiclePallet(current), before = JSON.stringify(current);
    for (const target of [{ x: 4.5, y: .5, z: 0 }, { x: -1, y: .5, z: 0 }, { x: NaN, y: .5, z: 0 }, { x: Infinity, y: .5, z: 0 },
      { x: 2.5, y: .5, z: .2 }, { x: 2.5, y: .5, z: 1.5 }]) {
      const checked = assessStagingRelocation(current, unit, target);
      expect(checked.valid).toBe(false); expect(checked.result).toBe(current.result); expect(checked.pallets).toBe(current.pallets);
      expect(checked.previous.result).toBe(current.result); expect(checked.changed).toBe(false); expect(checked.invalidateVerification).toBe(false);
    }
    expect(JSON.stringify(current)).toBe(before);
  });
  it('rejects partial membership, stale coordinates/current packaging, duplicate indices and other-vehicle requests', () => {
    const current = relocationFixture(), selected = vehiclePallet(current), target = { x: 1.8, y: .5, z: 0 };
    for (const unit of [{ ...selected, boxUnits: selected.boxUnits.slice(0, 1) },
      { ...selected, pallet: { ...selected.pallet!, x: selected.pallet!.x + .1 } },
      { ...selected, location: 'other-vehicle' as const }, { ...selected, location: 'yard' as const }]) {
      const checked = assessStagingRelocation(current, unit, target); expect(checked.valid).toBe(false); expect(checked.result).toBe(current.result);
    }
    expect(assessStagingRelocation({ ...current, palletSpec: { ...current.palletSpec!, useWrapping: false } }, selected, target).valid).toBe(false);
    const duplicate = { ...current, pallets: [current.pallets[0], { ...current.pallets[1], palletIndex: current.pallets[0].palletIndex }] };
    expect(assessStagingRelocation(duplicate, selected, target).valid).toBe(false);
    const insideBox = { ...box('A:0', 'vehicle'), placement: current.result.placements[0] };
    expect(assessStagingRelocation(current, insideBox, target).reasons.join()).toContain('내부 박스');
  });
  it('retains a loose box’s existing rotation and index while rejecting stale identity and support removal', () => {
    const row = { ...item, quantity: 1, length: 1, width: .5 }, current = context([], [row]);
    const added = assessStagingAddition(current, box('A:0'), { x: 1.5, y: .5, z: 0 }, true); expect(added.reasons).toEqual([]);
    const loaded = { ...current, result: added.result }, selected = { ...box('A:0', 'vehicle'), placement: added.result.placements[0] };
    const checked = assessStagingRelocation(loaded, selected, { x: .5, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.result.placements[0]).toMatchObject({ unitId: 'A:0', length: .5, width: 1, rotated: true, orientation: 'WLH' });
    const stale = { ...selected, placement: { ...selected.placement, x: 20 } };
    expect(assessStagingRelocation(loaded, stale, { x: .5, y: .5, z: 0 }).valid).toBe(false);
    const stacked = context([placement('A:0'), placement('A:1', 1.5, .5)]);
    expect(assessStagingRelocation(stacked, box('A:0', 'vehicle'), { x: 0, y: .5, z: 0 }).valid).toBe(false);
  });
  it('preserves an allowed three-axis A-rules orientation instead of rebuilding it as an LWH box', () => {
    const row = { ...item, quantity: 1, length: 1, width: .5, height: .25, allowedOrientations: ['HWL' as const] };
    const placed: Placement = { cargoId: 'A', unitId: 'A:0', x: 1.875, y: .75, z: 0, length: .25, width: .5, height: 1,
      weightKg: 20, orientation: 'HWL', rotated: true };
    const current = context([placed], [row]);
    current.container.rules = { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], source: 'test' };
    const selected = { ...box('A:0', 'vehicle'), placement: placed };
    const checked = assessStagingRelocation(current, selected, { x: 1.975, y: .75, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.result.placements[0]).toEqual({ ...placed, x: 1.975 });
    expect(current.result.placements[0]).toBe(placed); expect(placed.x).toBe(1.875);
  });
  it('keeps strict unloading and pallet top-load blockers in the final assessment', () => {
    const first = { ...item, id: 'FIRST', quantity: 1, unloadPriority: 1 }, later = { ...item, id: 'LATER', quantity: 1, unloadPriority: 2 };
    const make = (id: string, x: number, index: number): PalletLoad => ({ ...pallet(id + ':0').pallet!, x, y: .5, palletIndex: index, stackColumn: index,
      cargoPlacements: [{ ...placement(id + ':0', x, .15), cargoId: id }], centerOfGravity: { x: x + .5, y: 1, z: .35 } });
    const pallets = [make('FIRST', 3, 1), make('LATER', 1, 2)];
    const current: StagingCommandContext = { ...palletContext(), cargo: [first, later], container: { ...context().container, unloadingPolicy: 'strict' },
      pallets, result: { ...empty(), placements: pallets.flatMap(load => load.cargoPlacements) } };
    const checked = assessStagingRelocation(current, vehiclePallet(current), { x: 0, y: .5, z: 0 });
    expect(checked.valid).toBe(false); expect(checked.reasons.join()).toMatch(/UNLOAD|하역/);
    const lowerLoad = { ...pallet('A:0').pallet!, x: .5, y: .5, cargoPlacements: [placement('A:0', .5, .15)], centerOfGravity: { x: 1, y: 1, z: .35 } };
    const otherLoad = { ...pallet('A:1').pallet!, x: 2.5, y: .5, palletIndex: 2, stackColumn: 2,
      cargoPlacements: [placement('A:1', 2.5, .15)], centerOfGravity: { x: 3, y: 1, z: .35 } };
    const loaded = { ...palletContext(), pallets: [lowerLoad, otherLoad], result: { ...empty(), placements: [...lowerLoad.cargoPlacements, ...otherLoad.cargoPlacements] }, cargo: [{ ...item, maxTopLoadKg: 0 }] };
    const upper = assessStagingRelocation(loaded, vehiclePallet(loaded, 1), { x: .5, y: .5, z: .65 });
    expect(upper.valid).toBe(false); expect(upper.reasons.join()).toMatch(/上|상부|하중/);
  });
  it('recomputes actual securing mass rather than trusting saved totals', () => {
    const current = relocationFixture(), selected = vehiclePallet(current);
    const altered = { ...current, result: { ...current.result, loadedWeightKg: 1, usedVolumeM3: 999,
      securingBudget: { level: 3 as const, reservedWeightKg: 0, requiredWeightKg: 0, totalTransportWeightKg: 1 } } };
    const checked = assessStagingRelocation(altered, selected, { x: 1.8, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.result.loadedWeightKg).toBeCloseTo(71.7);
    expect(checked.result.usedVolumeM3).toBeCloseTo(1.5); expect(checked.result.securingBudget!.totalTransportWeightKg).toBeGreaterThan(71.7);
  });
  it('rejects a newly excessive floor load even when the moved box has full geometric support', () => {
    const heavy = { ...item, quantity: 2, weightKg: 100, maxTopLoadKg: 200 };
    const current = context([{ ...placement('A:0', 0), y: 0, weightKg: 100 }, { ...placement('A:1', 2), y: 0, weightKg: 100 }], [heavy]);
    current.container.floorLoadLimitKgPerM2 = 150;
    const selected = { ...box('A:1', 'vehicle'), placement: current.result.placements[1] };
    const checked = assessStagingRelocation(current, selected, { x: 0, y: 0, z: .5 });
    expect(checked.valid).toBe(false); expect(checked.reasons.join()).toContain('FLOOR_LOAD_LIMIT'); expect(checked.result).toBe(current.result);
  });
  it('rejects a newly excessive payload caused by actual final securing and void-fill requirements', () => {
    const row = { ...item, id: 'VOID', quantity: 1, length: .6, width: 2.35, height: .8, weightKg: 95, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: false };
    const placed = { cargoId: row.id, unitId: 'VOID:0', x: 3.4, y: 0, z: 0, length: .6, width: 2.35, height: .8, weightKg: 95 };
    const current = { ...context([placed], [row]), container: { length: 4, width: 2.35, height: 2, maxPayloadKg: 100 } };
    const selected = { ...box('VOID:0', 'vehicle', 'VOID'), placement: placed };
    const checked = assessStagingRelocation(current, selected, { x: 0, y: 0, z: 0 });
    expect(checked.valid).toBe(false); expect(checked.reasons.join()).toContain('새 안전 차단 오류'); expect(checked.result).toBe(current.result);
  });
  it('preserves current non-worsening payload errors instead of manufacturing a PASS', () => {
    const source = relocationFixture(), current = { ...source, container: { ...source.container, maxPayloadKg: 50 } };
    const checked = assessStagingRelocation(current, vehiclePallet(current), { x: 1.8, y: .5, z: 0 });
    expect(checked.reasons).toEqual([]); expect(checked.valid).toBe(true); expect(checked.invalidateVerification).toBe(true);
    expect(checked.result.validationIssues.some(issue => issue.type === 'PAYLOAD')).toBe(true);
    expect(checked.result.securingBudget!.totalTransportWeightKg).toBeGreaterThan(50);
  });
  it('never writes stores or publishes results/certification during a relocation assessment', () => {
    const current = relocationFixture(), selected = vehiclePallet(current);
    const dispatch = vi.spyOn(window, 'dispatchEvent'), writes = vi.spyOn(Storage.prototype, 'setItem');
    assessStagingRelocation(current, selected, { x: 1.8, y: .5, z: 0 });
    expect(dispatch).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); dispatch.mockRestore(); writes.mockRestore();
  });
});
