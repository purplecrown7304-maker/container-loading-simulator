import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './engine/palletOptimization';
import { packMixedMode } from './engine/mixedModePacking';
import type { LoadingResult } from './engine/types';
import { stagingInputSignature, type StagingInput } from './stagingInventory';
import { matchingStagingMetadata, stagingMetadata, validSavedStagingPallet, type SavedStagingWorkspace } from './stagingPersistence';
import { readStoredState, STORAGE_KEY, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';

const input: StagingInput = {
  scopeKey: 'saved-shipment', mode: 'boxes',
  container: { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 },
  cargo: [{ id: 'A', name: '상품', length: .5, width: .5, height: .3, weightKg: 10, quantity: 2, allowRotation: true }],
};
const result: LoadingResult = { placements: [], remaining: [{ cargoId: 'A', quantity: 2, reason: '대기', reasonCode: 'STAGING_PENDING' }], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
const saved = (source = input): SavedStagingWorkspace => ({ version: 1, scopeKey: source.scopeKey,
  inputSignature: stagingInputSignature(source), mode: source.mode,
  identity: { unitToStableId: { 'legacy-1': 'staging-box:saved-shipment:A:0' } }, selectedUnitId: 'staging-box:saved-shipment:A:0' });
const snapshot = { spec: defaultPalletSpec, result: packOnPallets(input.container, input.cargo, defaultPalletSpec) };
const clone = <T,>(value: T): T => structuredClone(value);
afterEach(() => { localStorage.removeItem(STORAGE_KEY); vi.restoreAllMocks(); });

describe('saved staging provenance', () => {
  it('round-trips aliases, selection and real pallet plans without storing separate yard quantities', () => {
    const source = { ...input, mode: 'pallets' as const, palletSpec: defaultPalletSpec };
    const metadata = { ...saved(source), palletSnapshot: snapshot, palletTypeId: 'standard', yardPallets: snapshot.result.pallets };
    writeStoredState({ container: input.container, cargo: input.cargo, result, staging: metadata });
    const stored = readStoredState()!;
    expect(stored.staging).toEqual(metadata);
    expect(matchingStagingMetadata(stored.staging, source)).toEqual(metadata);
    expect(stored.result).toEqual(result);
    expect(stored.staging).not.toHaveProperty('yardQuantity');
    expect(snapshot.result.pallets.length).toBeGreaterThan(0);
    expect(snapshot.result.pallets.every(validSavedStagingPallet)).toBe(true);
  });

  it('accepts input-only and result-only saves written before staging existed', () => {
    for (const old of [{ container: input.container, cargo: input.cargo }, { container: input.container, cargo: input.cargo, result }]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
      const stored = readStoredState();
      expect(stored?.container).toEqual(input.container); expect(stored?.cargo).toEqual(input.cargo);
      expect(stored?.staging).toBeUndefined();
      expect(matchingStagingMetadata(stored?.staging, input)).toBeNull();
      expect(stored?.result).toEqual('result' in old ? result : undefined);
    }
  });

  it('requires the same scope, mode, strategy and physical input signature', () => {
    const metadata = saved();
    const mismatches: StagingInput[] = [
      { ...input, scopeKey: 'other-shipment' }, { ...input, mode: 'pallets' }, { ...input, mode: 'mixed' },
      { ...input, strategy: 'unloading' }, { ...input, strategy: 'capacity' }, { ...input, container: { ...input.container, maxPayloadKg: 999 } },
      { ...input, cargo: [{ ...input.cargo[0], quantity: 3 }] },
    ];
    for (const changed of mismatches) expect(matchingStagingMetadata(metadata, changed)).toBeNull();
    expect(matchingStagingMetadata({ ...metadata, inputSignature: 'staging-v1:stale' }, input)).toBeNull();
    expect(matchingStagingMetadata({ ...metadata, scopeKey: 'other-shipment' }, input)).toBeNull();
    expect(matchingStagingMetadata({ ...metadata, mode: 'mixed' }, input)).toBeNull();
    const palletInput: StagingInput = { ...input, mode: 'pallets', palletSpec: defaultPalletSpec };
    expect(matchingStagingMetadata(saved(palletInput), { ...palletInput, palletSpec: { ...defaultPalletSpec, maxLoadKg: 100 } })).toBeNull();
    expect(matchingStagingMetadata(metadata, { ...input, cargo: [{ ...input.cargo[0], name: '표시명 변경', displayColor: '#abcdef' }] })).toEqual(metadata);
  });

  it.each([
    null, [], 1, 'metadata', {},
    { ...saved(), version: 2 }, { ...saved(), scopeKey: '' }, { ...saved(), inputSignature: '' },
    { ...saved(), mode: 'BOX_ONLY' }, { ...saved(), selectedUnitId: undefined },
    { ...saved(), selectedUnitId: 2 }, { ...saved(), selectedUnitId: '' },
    { ...saved(), identity: null }, { ...saved(), identity: [] },
    { ...saved(), identity: { unitToStableId: [] } }, { ...saved(), identity: { unitToStableId: 'alias' } },
    { ...saved(), identity: { unitToStableId: { old: 2 } } }, { ...saved(), identity: { unitToStableId: { old: '' } } },
    { ...saved(), palletTypeId: false }, { ...saved(), palletSnapshot: null },
  ])('rejects malformed metadata without throwing (%#)', value => {
    expect(() => stagingMetadata(value)).not.toThrow(); expect(stagingMetadata(value)).toBeNull();
  });

  it('accepts a cleared selection and an empty alias map', () => {
    const metadata = { ...saved(), identity: { unitToStableId: {} }, selectedUnitId: null };
    expect(stagingMetadata(metadata)).toEqual(metadata);
  });

  it('keeps mixed-mode metadata and a valid manual securing budget intact', () => {
    const source = { ...input, mode: 'mixed' as const, palletSpec: defaultPalletSpec };
    const result = packMixedMode(input.container, input.cargo, defaultPalletSpec);
    const securingBudget = { level: 3, reservedWeightKg: 4, requiredWeightKg: 3, totalTransportWeightKg: result.mixed.totalLoadedWeightKg + 4 };
    const metadata = { ...saved(source), palletSnapshot: { spec: defaultPalletSpec, result: { ...result, securingBudget } } };
    expect(matchingStagingMetadata(metadata, source)).toEqual(metadata);
    expect(stagingMetadata({ ...metadata, palletSnapshot: { ...metadata.palletSnapshot, result: { ...result, mixed: null } } })).toBeNull();
    expect(stagingMetadata({ ...metadata, palletSnapshot: { ...metadata.palletSnapshot, result: { ...result, securingBudget: { ...securingBudget, level: '3' } } } })).toBeNull();
  });

  it.each([[0, 0], [1, 2], [2, 3], [3, 4]] as const)('round-trips the real level %i banding plan with %i straps', (securingLevel, straps) => {
    const pallet = { ...snapshot.result.pallets[0], bandingPlan: { straps, securingLevel } };
    const metadata = { ...saved(), yardPallets: [pallet], palletSnapshot: { ...snapshot, result: { ...snapshot.result, pallets: [pallet] } } };
    expect(validSavedStagingPallet(pallet)).toBe(true);
    writeStoredState({ container: input.container, cargo: input.cargo, staging: metadata });
    expect(readStoredState()?.staging).toEqual(metadata);
    expect(stagingMetadata(saved())).not.toBeNull();
    expect(validSavedStagingPallet(snapshot.result.pallets[0])).toBe(true); // Legacy missing metadata stays compatible.
  });

  it.each([
    null, [], '4', {}, { straps: 4 }, { securingLevel: 3 },
    { straps: '4', securingLevel: 3 }, { straps: 4, securingLevel: '3' },
    { straps: 4.5, securingLevel: 3 }, { straps: -1, securingLevel: 0 },
    { straps: 1, securingLevel: 1 }, { straps: 2, securingLevel: 3 },
    { straps: 0, securingLevel: 1 }, { straps: 4, securingLevel: 0 },
    { straps: 4, securingLevel: -1 }, { straps: 4, securingLevel: 4 },
    { straps: 4, securingLevel: 2.5 }, { straps: 1000000000, securingLevel: 3 },
    { straps: Number.MAX_SAFE_INTEGER + 1, securingLevel: 3 },
    { straps: NaN, securingLevel: 3 }, { straps: Infinity, securingLevel: 3 },
    { straps: 4, securingLevel: NaN }, { straps: 4, securingLevel: Infinity },
  ])('rejects malformed or invented banding metadata before scene construction (%#)', bandingPlan => {
    const pallet = { ...snapshot.result.pallets[0], bandingPlan };
    expect(validSavedStagingPallet(pallet)).toBe(false);
    expect(stagingMetadata({ ...saved(), yardPallets: [pallet] })).toBeNull();
    expect(stagingMetadata({ ...saved(), palletSnapshot: { ...snapshot, result: { ...snapshot.result, pallets: [pallet] } } })).toBeNull();
  });

  it.each(['wrapping', 'cornerGuards'] as const)('preserves optional actual %s and rejects non-boolean substitutes', flag => {
    for (const value of [undefined, false, true]) {
      const pallet = { ...snapshot.result.pallets[0], bandingPlan: { straps: 4, securingLevel: 3 as const, [flag]: value } };
      expect(validSavedStagingPallet(pallet)).toBe(true);
      expect(stagingMetadata({ ...saved(), yardPallets: [pallet] })?.yardPallets?.[0].bandingPlan).toEqual(pallet.bandingPlan);
    }
    for (const value of ['true', 'false', 0, 1, null, [], {}]) {
      const pallet = { ...snapshot.result.pallets[0], bandingPlan: { straps: 4, securingLevel: 3, [flag]: value } };
      expect(validSavedStagingPallet(pallet)).toBe(false);
      expect(stagingMetadata({ ...saved(), yardPallets: [pallet] })).toBeNull();
      expect(stagingMetadata({ ...saved(), palletSnapshot: { ...snapshot, result: { ...snapshot.result, pallets: [pallet] } } })).toBeNull();
    }
  });

  it('rejects damaged snapshot contents and yard pallet structures before consumers iterate them', () => {
    const edits: Array<(value: Record<string, any>) => void> = [
      value => { value.spec = null; }, value => { value.spec.length = -1; },
      value => { value.result.pallets = [null]; }, value => { value.result.placements = [null]; },
      value => { value.result.remaining = [null]; }, value => { value.result.optimization = null; },
      value => { value.result.optimization.selectedStackTarget = '2'; },
      value => { value.result.mixed = { enabled: true, palletFillRates: null }; },
      value => { value.result.securingBudget = { level: 9, reservedWeightKg: 2, requiredWeightKg: 2, totalTransportWeightKg: 20 }; },
      value => { value.result.pallets[0].cargoPlacements = [null]; },
      value => { value.result.pallets[0].centerOfGravity = null; },
      value => { value.result.placements[0].weightKg = NaN; },
      value => { value.result.totalPalletizedWeightKg = Infinity; },
    ];
    for (const edit of edits) {
      const damaged = clone(snapshot); edit(damaged);
      expect(stagingMetadata({ ...saved(), palletSnapshot: damaged })).toBeNull();
    }
    for (const yardPallets of [null, {}, [null], [{ cargoPlacements: [] }], [{ ...snapshot.result.pallets[0], totalWeightKg: -10 }]]) {
      expect(stagingMetadata({ ...saved(), yardPallets })).toBeNull();
    }
    expect(stagingMetadata({ ...saved(), yardPallets: [] })).not.toBeNull();
  });

  it('discards corrupt optional metadata while retaining compatible input and final result', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ container: input.container, cargo: input.cargo, result,
      staging: { ...saved(), identity: { unitToStableId: ['corrupt'] } } }));
    const stored = readStoredState();
    expect(stored?.staging).toBeUndefined(); expect(stored?.result).toEqual(result); expect(stored?.cargo).toEqual(input.cargo);
    localStorage.setItem(STORAGE_KEY, '{invalid'); expect(readStoredState()).toBeNull();
  });

  it('preserves valid staging for legacy same-input writers and emits the complete normalized state', () => {
    const metadata = saved(); writeStoredState({ container: input.container, cargo: input.cargo, result, staging: metadata });
    const listener = vi.fn(); window.addEventListener(STORAGE_UPDATED_EVENT, listener);
    try {
      writeStoredState({ container: { ...input.container }, cargo: input.cargo.map(row => ({ ...row })) }, true);
      expect(readStoredState()?.staging).toEqual(metadata);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail.staging).toEqual(metadata);
    } finally { window.removeEventListener(STORAGE_UPDATED_EVENT, listener); }
  });

  it('never inherits old staging when new input replaces the saved shipment', () => {
    const changes = [
      { container: { ...input.container, width: 2 }, cargo: input.cargo },
      { container: input.container, cargo: [{ ...input.cargo[0], quantity: 3 }] },
      { container: input.container, cargo: [{ ...input.cargo[0], id: 'NEW' }] },
    ];
    for (const changed of changes) {
      writeStoredState({ container: input.container, cargo: input.cargo, staging: saved() });
      writeStoredState(changed); expect(readStoredState()?.staging).toBeUndefined();
    }
  });

  it('never resurrects previous metadata over an explicit replacement or a corrupt explicit payload', () => {
    const metadata = saved(); writeStoredState({ container: input.container, cargo: input.cargo, staging: metadata });
    const replacement = { ...metadata, selectedUnitId: null, identity: { unitToStableId: {} } };
    writeStoredState({ container: input.container, cargo: input.cargo, staging: replacement });
    expect(readStoredState()?.staging).toEqual(replacement);
    writeStoredState({ container: input.container, cargo: input.cargo, staging: { ...metadata, version: 9 } as unknown as SavedStagingWorkspace });
    expect(readStoredState()?.staging).toBeUndefined();
  });
});
