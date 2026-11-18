// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildStagingInventory, identifyStagingPlan, prepareStagingPackaging, stagingInputSignature, stagingLoadKey,
  type StagingInput, type StagingInventory, type StagingSelectedPlan } from './stagingInventory';
import { defaultPalletSpec, packOnPallets, type PalletLoad } from './engine/palletOptimization';
import { buildPalletPackaging } from './engine/mixedModePacking';
import type { CargoItem, LoadingResult, Placement } from './engine/types';
import { buildPalletLoadFromDeckPlacements } from './engine/palletPacking';

const cargo = (extra: Partial<CargoItem> = {}): CargoItem => ({ id: 'BOX:A', name: '등록 박스', length: .5, width: .5,
  height: .3, weightKg: 10, quantity: 20, maxStackLayers: 1, maxTopLoadKg: 0, displayColor: '#334455', ...extra });
const source = (extra: Partial<StagingInput> = {}): StagingInput => ({ scopeKey: 'synthetic-workspace', mode: 'boxes',
  container: { length: 6, width: 2.35, height: 2.5, maxPayloadKg: 1000 }, cargo: [cargo()], ...extra });
const result = (placements: Placement[], remaining: LoadingResult['remaining'] = []): LoadingResult => ({
  placements, remaining, loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0),
  usedVolumeM3: placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0), validationIssues: [],
});
const placement = (x = 0, extra: Partial<Placement> = {}): Placement => ({ cargoId: 'BOX:A', x, y: 0, z: 0,
  length: .5, width: .5, height: .3, weightKg: 10, ...extra });
const selected = (input: StagingInput, placements: Placement[], extra: Partial<StagingSelectedPlan> = {}): StagingSelectedPlan =>
  ({ inputSignature: stagingInputSignature(input), result: result(placements), ...extra });
function conserved(inventory: StagingInventory, total: number) {
  expect(inventory.summary.total.boxes).toBe(total);
  expect(inventory.summary.vehicle.boxes + inventory.summary.otherVehicles.boxes + inventory.summary.yard.boxes).toBe(total);
  expect(inventory.summary.unloaded.boxes).toBeLessThanOrEqual(inventory.summary.yard.boxes);
  expect(new Set(inventory.units.flatMap(unit => unit.boxUnits.map(box => box.stableId))).size).toBe(total);
}
function movePallet(load: PalletLoad, x: number, y: number, z: number, palletIndex = load.palletIndex): PalletLoad {
  return { ...load, x, y, z, palletIndex, cargoPlacements: load.cargoPlacements.map(p =>
    ({ ...p, x: p.x - load.x + x, y: p.y - load.y + y, z: p.z - load.z + z })) };
}

describe('staging inventory derives one conserved shipment', () => {
  it('derives mixed pallet SKU names, actual member counts and original custom colors without another quantity state', () => {
    const input = source({ mode: 'pallets', palletSpec: defaultPalletSpec, cargo: [cargo({ quantity: 1, name: '냉각 팬', displayColor: '#123456' }), cargo({ id: 'B', quantity: 1, name: '교체 필터', displayColor: '#efac12' })] });
    const load = buildPalletLoadFromDeckPlacements(1, [placement(), placement(.5, { cargoId: 'B' })], defaultPalletSpec);
    const before = JSON.stringify(input);
    const inventory = buildStagingInventory({ ...input, packaging: { inputSignature: stagingInputSignature(input), status: 'ready', pallets: [{ ...load, bandingPlan: { straps: 4, securingLevel: 3 } }] } });
    const unit = inventory.yardUnits[0];
    expect(unit.kind).toBe('pallet');
    expect(unit.contents).toEqual([{ cargoId: 'B', name: '교체 필터', boxCount: 1, displayColor: '#efac12', labelCode: 'B', unitsPerPackage: undefined }, { cargoId: 'BOX:A', name: '냉각 팬', boxCount: 1, displayColor: '#123456', labelCode: 'BOX:A', unitsPerPackage: undefined }]);
    expect(unit.contents!.reduce((sum, row) => sum + row.boxCount, 0)).toBe(unit.boxCount);
    expect(unit.packaging?.bandingStraps).toBe(4); conserved(inventory, 2); expect(JSON.stringify(input)).toBe(before);
  });
  it('shows exactly twenty real-sized boxes before calculation', () => {
    const inventory = buildStagingInventory(source());
    expect(inventory.yardUnits).toHaveLength(20);
    expect(inventory.yardUnits[0]).toMatchObject({ kind: 'box', location: 'yard', verdict: 'pending',
      length: .5, width: .5, height: .3, weightKg: 10, displayColor: '#334455' });
    expect(inventory.summary.total).toEqual({ pallets: 0, looseBoxes: 20, boxes: 20, weightKg: 200 });
    expect(inventory.summary.unloaded.boxes).toBe(0); conserved(inventory, 20);
  });
  it('handles zero and one cargo without invented pallets or failures', () => {
    expect(buildStagingInventory(source({ cargo: [] })).units).toEqual([]);
    const one = buildStagingInventory(source({ cargo: [cargo({ quantity: 1 })] }));
    conserved(one, 1); expect(one.units[0].verdict).toBe('pending');
  });
  it('canonicalizes row order and ignores labels while preserving physical provenance', () => {
    const a = cargo(); const b = cargo({ id: 'B', quantity: 2 });
    const input = source({ cargo: [a, b] });
    const reordered = source({ cargo: [{ ...b, name: '다른 표시명' }, { ...a, displayColor: '#fff', productName: '표시' }] });
    expect(stagingInputSignature(input)).toBe(stagingInputSignature(reordered));
    expect(buildStagingInventory(input).yardUnits.map(unit => unit.id)).toEqual(buildStagingInventory(reordered).yardUnits.map(unit => unit.id));
    expect(stagingInputSignature(source({ cargo: [cargo({ quantity: 21 })] }))).not.toBe(stagingInputSignature(source()));
    expect(stagingInputSignature(source({ container: { ...input.container, width: 1.7 } }))).not.toBe(stagingInputSignature(source()));
    expect(stagingInputSignature(source({ strategy: 'capacity' }))).toBe(stagingInputSignature(source()));
    expect(stagingInputSignature(source({ cargo: [cargo({ allowRotation: true })] }))).toBe(stagingInputSignature(source()));
    expect(stagingInputSignature(source({ strategy: 'stability' }))).not.toBe(stagingInputSignature(source()));
  });
  it('adds identities at the end without changing existing box IDs', () => {
    const old = buildStagingInventory(source({ cargo: [cargo({ quantity: 3 })] }));
    const added = buildStagingInventory(source({ cargo: [cargo({ quantity: 4 })] }));
    expect(added.units.slice(0, 3).map(unit => unit.id)).toEqual(old.units.map(unit => unit.id));
    expect(buildStagingInventory(source({ scopeKey: 'another-workspace' })).units[0].id).not.toBe(old.units[0].id);
  });
  it('deducts only placed boxes, with unloaded a subset of the yard', () => {
    const input = source(); const plan = selected(input, [placement(), placement(.5)]);
    plan.result.remaining = [{ cargoId: 'BOX:A', quantity: 18, reason: '등록 중량 한도', reasonCode: 'PAYLOAD_LIMIT' }];
    const inventory = buildStagingInventory({ ...input, selectedPlan: plan });
    expect(inventory.summary.vehicle.boxes).toBe(2); expect(inventory.summary.yard.boxes).toBe(18);
    expect(inventory.summary.unloaded.boxes).toBe(18);
    expect(inventory.yardUnits[0].reasons).toEqual([{ reason: '등록 중량 한도', reasonCode: 'PAYLOAD_LIMIT' }]);
    conserved(inventory, 20);
  });
  it('does not guess space shortage when a result supplies no reason', () => {
    const input = source(); const inventory = buildStagingInventory({ ...input, selectedPlan: selected(input, []) });
    expect(inventory.yardUnits[0]).toMatchObject({ verdict: 'unloaded', reasons: [{ reason: '사유 정보 없음' }] });
    conserved(inventory, 20);
  });
  it.each(['STAGING_PENDING', 'STAGING_WITHDRAWN'])('keeps manual %s inventory pending, not engine failure', reasonCode => {
    const input = source(); const plan = selected(input, []);
    plan.result.remaining = [{ cargoId: 'BOX:A', quantity: 20, reason: '대기장에 대기', reasonCode }];
    const inventory = buildStagingInventory({ ...input, selectedPlan: plan });
    expect(inventory.summary.unloaded.boxes).toBe(0);
    expect(inventory.yardUnits.every(unit => unit.verdict === 'pending')).toBe(true); conserved(inventory, 20);
  });
  it('retains all inventory and current placement while a new calculation is in progress', () => {
    const input = source(); const inventory = buildStagingInventory({ ...input, calculating: true,
      selectedPlan: selected(input, [placement()]) });
    expect(inventory.vehicleUnits).toHaveLength(1); expect(inventory.yardUnits.every(unit => unit.verdict === 'checking')).toBe(true);
    conserved(inventory, 20);
  });
  it('does not consume stale, foreign-workspace, unknown-SKU or excess results', () => {
    const input = source();
    const cases = [
      { ...selected(input, [placement()]), inputSignature: 'old' },
      selected(input, [placement(0, { cargoId: 'missing' })]),
      selected(input, [placement(0, { weightKg: 999 })]),
      selected(input, [placement(0, { length: .9 })]),
      selected(input, Array.from({ length: 21 }, (_, index) => placement(index))),
      selected(input, [placement(0, { unitId: 'staging-box:other:BOX%3AA:0' })]),
    ];
    for (const plan of cases) {
      const inventory = buildStagingInventory({ ...input, selectedPlan: plan });
      expect(inventory.referenceResult).toBe(true); expect(inventory.vehicleUnits).toEqual([]);
      expect(inventory.issues.length).toBeGreaterThan(0); conserved(inventory, 20);
    }
  });
  it('keeps input errors separately and never generates invalid render geometry', () => {
    const input = source({ cargo: [cargo(), cargo({ id: 'INVALID', length: -1, quantity: 2 }),
      cargo({ id: 'CONFLICT', quantity: 1 }), cargo({ id: 'CONFLICT', length: .8, quantity: 2 })] });
    const inventory = buildStagingInventory(input); conserved(inventory, 20);
    expect(inventory.excluded.map(row => row.cargoId)).toEqual(['INVALID', 'CONFLICT']);
    expect(inventory.excluded.every(row => row.reason.length > 0)).toBe(true);
  });
  it('does not show other accepted vehicles in the current yard or add comparison plans', () => {
    const input = source();
    const inventory = buildStagingInventory({ ...input, selectedPlan: selected(input, [placement(), placement(.5)], { vehicleId: '1' }),
      otherVehicles: [{ ...selected(input, [placement(), placement(.5), placement(1)]), vehicleId: '2' }] });
    expect(inventory.summary.vehicle.boxes).toBe(2); expect(inventory.summary.otherVehicles.boxes).toBe(3);
    expect(inventory.summary.yard.boxes).toBe(15); conserved(inventory, 20);
    expect(buildStagingInventory({ ...input, selectedPlan: selected(input, [placement()]) }).summary.vehicle.boxes).toBe(1);
  });
  it('rejects an explicitly duplicated stable unit across vehicles', () => {
    const input = source(); const unitId = buildStagingInventory(input).units[0].boxUnits[0].id;
    const inventory = buildStagingInventory({ ...input, selectedPlan: selected(input, [placement(0, { unitId })], { vehicleId: '1' }),
      otherVehicles: [{ ...selected(input, [placement(0, { unitId })]), vehicleId: '2' }] });
    expect(inventory.summary.vehicle.boxes).toBe(1); expect(inventory.summary.otherVehicles.boxes).toBe(0);
    expect(inventory.issues.join(' ')).toContain('중복'); conserved(inventory, 20);
  });
});

describe('box and pallet identity through manual round trips', () => {
  it('attaches missing IDs once and keeps the other same-SKU units stable after withdrawal', () => {
    const input = source({ cargo: [cargo({ quantity: 3 })] });
    const plan = selected(input, [placement(), placement(.5), placement(1)]);
    const before = buildStagingInventory({ ...input, selectedPlan: plan });
    const identified = identifyStagingPlan(plan, before);
    expect(plan.result.placements.every(p => p.unitId === undefined)).toBe(true);
    const afterPlan = { ...identified, result: result(identified.result.placements.slice(1), [{ cargoId: 'BOX:A', quantity: 1, reason: '회수', reasonCode: 'STAGING_WITHDRAWN' }]) };
    const after = buildStagingInventory({ ...input, selectedPlan: afterPlan, identity: before.identity });
    expect(after.vehicleUnits.map(unit => unit.id)).toEqual(before.vehicleUnits.slice(1).map(unit => unit.id));
    expect(after.yardUnits[0].id).toBe(before.vehicleUnits[0].id); conserved(after, 3);
  });
  it('respects existing opaque engine IDs and retains their alias after restoring JSON', () => {
    const input = source({ cargo: [cargo({ quantity: 2 })] });
    const plan = selected(input, [placement(0, { unitId: 'old-A' }), placement(.5, { unitId: 'old-B' })]);
    const before = buildStagingInventory({ ...input, selectedPlan: plan });
    expect(identifyStagingPlan(plan, before).result.placements.map(p => p.unitId)).toEqual(['old-A', 'old-B']);
    const after = buildStagingInventory({ ...input, selectedPlan: { ...plan, result: result([plan.result.placements[1]]) },
      identity: JSON.parse(JSON.stringify(before.identity)) });
    expect(after.vehicleUnits[0].id).toBe(before.vehicleUnits[1].id);
    expect(after.yardUnits[0].id).toBe(before.vehicleUnits[0].id); conserved(after, 2);
  });
  it('maps A-engine row-index IDs to stable SKU ordinals without replacing the engine ID', () => {
    const input = source({ cargo: [cargo({ quantity: 3 })] });
    const unitId = JSON.stringify([4, 'BOX:A', 2]);
    const inventory = buildStagingInventory({ ...input, selectedPlan: selected(input, [placement(0, { unitId })]) });
    expect(inventory.vehicleUnits[0].id).toBe(buildStagingInventory(input).units[2].id);
    expect(inventory.vehicleUnits[0].boxUnits[0].id).toBe(unitId);
  });
});

describe('full packaging uses existing packing and excludes vehicle capacity', () => {
  const palletInput = () => source({ mode: 'pallets', palletSpec: { ...defaultPalletSpec, maxStackLevels: 1 } });
  it('preserves the previous MIXED full-builder result for cargo that fits the vehicle height', () => {
    const input = palletInput(); const spec = input.palletSpec!;
    const quantity = input.cargo.reduce((sum, row) => sum + row.quantity, 0);
    const gross = input.cargo.reduce((sum, row) => sum + row.quantity * row.weightKg, 0)
      + quantity * (spec.tareWeightKg + spec.cornerGuardWeightKg + spec.wrappingWeightKg);
    const old = packOnPallets({ unloadingPolicy: input.container.unloadingPolicy, palletDestination: input.container.palletDestination,
      length: Math.max(spec.length, spec.length * quantity), width: spec.width, height: input.container.height,
      maxPayloadKg: Math.max(input.container.maxPayloadKg, gross + 1) }, input.cargo, { ...spec, maxStackLevels: 1 });
    expect(buildPalletPackaging(input.container, input.cargo, spec)).toEqual(old);
    expect(prepareStagingPackaging(input).pallets).toEqual(packOnPallets(input.container, input.cargo, spec).pallets);
  });
  it('shows the full request even when the actual vehicle has room/payload for less', () => {
    const input = palletInput(); input.container = { ...input.container, length: 1.1, width: 1.1, maxPayloadKg: 60 };
    const packaging = prepareStagingPackaging(input);
    expect(packaging.status).toBe('ready'); expect(packaging.pallets.length).toBeGreaterThan(1);
    const inventory = buildStagingInventory({ ...input, packaging });
    conserved(inventory, 20); expect(inventory.yardUnits.every(unit => unit.kind === 'pallet')).toBe(true);
    expect(inventory.summary.total.looseBoxes).toBe(0);
  });
  it('packages a too-tall single carton outside the vehicle but never exceeds its own stacking limits', () => {
    const input = palletInput(); input.container = { ...input.container, height: 1 };
    input.cargo = [cargo({ quantity: 2, height: 1.5, maxStackLayers: undefined })];
    const packaging = prepareStagingPackaging(input);
    expect(packaging.status).toBe('ready'); expect(packaging.pallets).toHaveLength(1);
    expect(packaging.pallets[0].cargoPlacements).toHaveLength(2);
    expect(packaging.pallets[0].cargoPlacements.every(p => p.z === input.palletSpec!.height)).toBe(true);
    expect(packaging.pallets[0].cargoPlacements[0].height).toBe(1.5);
    conserved(buildStagingInventory({ ...input, packaging }), 2);
    expect(input.container.height).toBe(1); expect(input.cargo[0].maxStackLayers).toBeUndefined();
  });
  it('keeps impossible pallet footprints as explicit packaging errors, not completed fake pallets', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 2, length: 2, width: 2 })];
    const packaging = prepareStagingPackaging(input); expect(packaging.status).toBe('error'); expect(packaging.pallets).toEqual([]);
    const inventory = buildStagingInventory({ ...input, packaging });
    expect(inventory.yardUnits.every(unit => unit.kind === 'box' && unit.verdict === 'error')).toBe(true);
    expect(inventory.yardUnits.every(unit => unit.reasons.length > 0)).toBe(true); conserved(inventory, 2);
  });
  it('counts pallet gross weights and contained cartons exactly once with actual wrapping flags', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 4 })];
    input.palletSpec = { ...input.palletSpec!, useWrapping: true, useCornerGuards: true, minimizePackaging: false };
    const packaging = prepareStagingPackaging(input); const inventory = buildStagingInventory({ ...input, packaging });
    const load = packaging.pallets[0]; expect(inventory.summary.total).toMatchObject({ pallets: 1, looseBoxes: 0, boxes: 4 });
    expect(inventory.summary.total.weightKg).toBe(load.totalWeightKg);
    expect(inventory.yardUnits[0].packaging).toEqual({ bandingStraps: 0, wrapping: true, cornerGuards: true });
    expect(inventory.yardUnits[0].localPlacements![0].z).toBeCloseTo(input.palletSpec.height);
    conserved(inventory, 4);
    const off = prepareStagingPackaging({ ...input, palletSpec: { ...input.palletSpec, useWrapping: false, useCornerGuards: false } });
    expect(off.pallets[0]).toMatchObject({ wrappingUsed: false, cornerGuardsUsed: false, packagingWeightKg: 0 });
  });
  it('moves the whole pallet and retains membership identity after coordinate/index changes', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 4 })];
    const packaging = prepareStagingPackaging(input); const load = packaging.pallets[0];
    const original = buildStagingInventory({ ...input, packaging });
    const moved = movePallet(load, 2, .4, .8, 7);
    const plan = selected(input, moved.cargoPlacements, { pallets: [moved] });
    const after = buildStagingInventory({ ...input, selectedPlan: plan,
      packaging: prepareStagingPackaging({ ...input, selectedPlan: plan }) });
    expect(after.vehicleUnits).toHaveLength(1); expect(after.yardUnits).toEqual([]);
    expect(after.vehicleUnits[0].id).toBe(original.yardUnits[0].id);
    expect(after.vehicleUnits[0].sourcePalletIndex).toBe(7); conserved(after, 4);
    const identified = identifyStagingPlan(plan, after);
    expect(identified.pallets![0].cargoPlacements.map(p => p.unitId)).toEqual(identified.result.placements.map(p => p.unitId));
  });
  it('packages only the remaining request after actual selected pallets and preserves both quantities', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 8 })];
    const all = prepareStagingPackaging(input); const load = all.pallets[0];
    const plan = selected(input, load.cargoPlacements, { pallets: [load] });
    const packaging = prepareStagingPackaging({ ...input, selectedPlan: plan });
    const inventory = buildStagingInventory({ ...input, selectedPlan: plan, packaging });
    expect(inventory.summary.vehicle.pallets).toBe(1); expect(inventory.summary.yard.pallets).toBe(1);
    expect(inventory.summary.vehicle.boxes).toBe(4); expect(inventory.summary.yard.boxes).toBe(4); conserved(inventory, 8);
  });
  it('rejects a stale yard-only packaging allocation after a manual load/withdrawal', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 8 })];
    const packaging = prepareStagingPackaging(input);
    const plan = selected(input, packaging.pallets[0].cargoPlacements, { pallets: [packaging.pallets[0]] });
    const inventory = buildStagingInventory({ ...input, selectedPlan: plan, packaging });
    expect(inventory.packagingStatus).toBe('pending'); expect(inventory.issues.join(' ')).toContain('배치량');
    conserved(inventory, 8);
  });
  it('retains whole identified waiting pallets through a withdrawal instead of repacking their members', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 8 })];
    const all = prepareStagingPackaging(input), inventory = buildStagingInventory({ ...input, packaging: all });
    const identified = inventory.yardUnits.map(unit => ({ ...unit.pallet!, cargoPlacements: unit.pallet!.cargoPlacements.map((p, i) => ({ ...p, unitId: unit.boxUnits[i].id })) }));
    const active = selected(input, identified[0].cargoPlacements, { pallets: [identified[0]] });
    const waiting = prepareStagingPackaging({ ...input, selectedPlan: active, preservedPallets: [identified[1]] });
    expect(waiting.pallets).toHaveLength(1); expect(waiting.pallets[0].cargoPlacements).toEqual(identified[1].cargoPlacements);
    const withdrawn = prepareStagingPackaging({ ...input, preservedPallets: [identified[1], identified[0]] });
    expect(withdrawn.pallets.map(load => load.cargoPlacements)).toEqual([identified[1].cargoPlacements, identified[0].cargoPlacements]);
    const next = buildStagingInventory({ ...input, packaging: withdrawn, identity: inventory.identity });
    expect(new Set(next.yardUnits.map(unit => unit.id))).toEqual(new Set(inventory.yardUnits.map(unit => unit.id))); conserved(next, 8);
  });
  it('rejects preserved membership overlap and corrupted dimensions without subtracting that cargo twice', () => {
    const input = palletInput(); input.cargo = [cargo({ quantity: 8 })];
    const initial = buildStagingInventory({ ...input, packaging: prepareStagingPackaging(input) });
    const unit = initial.yardUnits[0], load = { ...unit.pallet!, cargoPlacements: unit.pallet!.cargoPlacements.map((p, i) => ({ ...p, unitId: unit.boxUnits[i].id })) };
    const active = selected(input, load.cargoPlacements, { pallets: [load] });
    const overlap = prepareStagingPackaging({ ...input, selectedPlan: active, preservedPallets: [load] });
    const after = buildStagingInventory({ ...input, selectedPlan: active, packaging: overlap });
    conserved(after, 8); expect(after.yardUnits.flatMap(unit => unit.boxUnits.map(box => box.id)).some(id => load.cargoPlacements.some(p => p.unitId === id))).toBe(false);
    const corrupt = { ...load, cargoPlacements: load.cargoPlacements.map(p => ({ ...p, height: 1.99 })) };
    const rebuilt = prepareStagingPackaging({ ...input, preservedPallets: [corrupt] });
    expect(rebuilt.pallets.flatMap(p => p.cargoPlacements).every(p => p.height === .3)).toBe(true);
  });
  it('shows packaged pallets and explicit loose boxes together without counting their contents twice', () => {
    const input = source({ mode: 'mixed', cargo: [cargo({ quantity: 4, mixedLoadingMethod: 'pallet' }),
      cargo({ id: 'LOOSE', name: '낱박스', quantity: 3, mixedLoadingMethod: 'direct' })] });
    const packaging = prepareStagingPackaging(input); const inventory = buildStagingInventory({ ...input, packaging });
    expect(inventory.summary.total).toMatchObject({ pallets: 1, looseBoxes: 3, boxes: 7 });
    expect(inventory.yardUnits.filter(unit => unit.kind === 'box').every(unit => unit.cargoId === 'LOOSE')).toBe(true);
    conserved(inventory, 7);
  });
  it('does not mutate input/results or put yard coordinates into vehicle placements', () => {
    const input = palletInput(); const before = JSON.stringify(input);
    const packaging = prepareStagingPackaging(input); const encoded = JSON.stringify(packaging);
    const inventory = buildStagingInventory({ ...input, packaging });
    expect(JSON.stringify(input)).toBe(before); expect(JSON.stringify(packaging)).toBe(encoded);
    expect(inventory.vehicleUnits).toEqual([]); expect(inventory.summary.vehicle.weightKg).toBe(0);
    expect(JSON.parse(JSON.stringify(inventory)).summary.total).toEqual(inventory.summary.total);
  });
});

describe('pallet content key: built once per pallet, same text as before', () => {
  // The definition the key had before each row was serialised only once.
  const referenceKey = (load: PalletLoad) => JSON.stringify([load.length, load.width, load.height, load.wrappingUsed, load.cornerGuardsUsed,
    load.cargoPlacements.map(p => [p.cargoId, ...[p.x - load.x, p.y - load.y, p.z - load.z, p.length, p.width, p.height, p.weightKg].map(n => Number(n.toFixed(8)))])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  const rows = [cargo({ id: 'A-10', length: .3, width: .2, height: .2, weightKg: 4, quantity: 140, maxStackLayers: 6, maxTopLoadKg: 200 }),
    cargo({ id: 'a-9', length: .4, width: .3, height: .25, weightKg: 7, quantity: 60, maxStackLayers: 4, maxTopLoadKg: 200 }),
    cargo({ id: 'B:2', length: .25, width: .25, height: .15, weightKg: 2, quantity: 90, maxStackLayers: 8, maxTopLoadKg: 200 })];
  const input = source({ mode: 'pallets', palletSpec: defaultPalletSpec, cargo: rows,
    container: { length: 12, width: 2.35, height: 2.6, maxPayloadKg: 20000 } });

  it('equals the former key for packed, moved, repackaged and degenerate pallets', () => {
    const packed = packOnPallets(input.container, rows, defaultPalletSpec, 'capacity');
    expect(packed.pallets.length).toBeGreaterThan(1);
    const first = packed.pallets[0];
    const twin = buildPalletLoadFromDeckPlacements(9, [placement(), placement(), placement(.5)], defaultPalletSpec);
    const loads: PalletLoad[] = [...packed.pallets, movePallet(first, 3.7, .4, 0), { ...first, wrappingUsed: !first.wrappingUsed },
      { ...first, cargoPlacements: [...first.cargoPlacements].reverse() }, twin, { ...twin, cargoPlacements: [] }];
    for (const load of loads) expect(stagingLoadKey(load)).toBe(referenceKey(load));
    // Position and carton order do not enter the key; packaging does.
    expect(stagingLoadKey(movePallet(first, 3.7, .4, 0))).toBe(stagingLoadKey(first));
    expect(stagingLoadKey({ ...first, cargoPlacements: [...first.cargoPlacements].reverse() })).toBe(stagingLoadKey(first));
    expect(stagingLoadKey({ ...first, wrappingUsed: !first.wrappingUsed })).not.toBe(stagingLoadKey(first));
  });

  it('lists loaded pallets in the former key order and matches them against the packaging plan', () => {
    const packed = packOnPallets(input.container, rows, defaultPalletSpec, 'capacity');
    const plan: StagingSelectedPlan = { inputSignature: stagingInputSignature(input), result: result(packed.placements, packed.remaining), pallets: packed.pallets };
    const packaging = { inputSignature: plan.inputSignature, status: 'ready' as const, pallets: packed.pallets.map(load => movePallet(load, 0, 0, 0)) };
    const inventory = buildStagingInventory({ ...input, selectedPlan: plan, packaging });
    const expectedOrder = [...packed.pallets].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)) || a.palletIndex - b.palletIndex)
      .map(load => load.palletIndex);
    expect(inventory.vehicleUnits.filter(unit => unit.kind === 'pallet').map(unit => unit.sourcePalletIndex)).toEqual(expectedOrder);
    // Every packaged pallet is already on the vehicle, so none is offered again in the yard.
    expect(inventory.yardUnits.filter(unit => unit.kind === 'pallet')).toEqual([]);
    expect(inventory.issues).toEqual([]);
    conserved(inventory, rows.reduce((sum, row) => sum + row.quantity, 0));
    expect(buildStagingInventory({ ...input, selectedPlan: plan, packaging })).toEqual(inventory);
  });
});
