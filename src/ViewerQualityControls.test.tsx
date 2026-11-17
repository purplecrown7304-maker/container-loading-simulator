import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ViewerQualityControls from './ViewerQualityControls';
import { readViewerQuality, saveViewerQuality, VIEWER_QUALITY_EVENT, VIEWER_QUALITY_KEY } from './viewerQuality';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { PHYSICS_TARGET_EVENT, publishPhysicsTarget, readPhysicsTarget, clearPhysicsTarget } from './physicsTarget';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import { APP_ACTION_EVENT } from './uiEvents';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { buildStagingInventory, stagingInputSignature, type StagingInput } from './stagingInventory';
import { setUiLanguage } from './uiLanguage';

let root: Root, host: HTMLDivElement;
const input: StagingInput = { scopeKey: 'quality-isolation', mode: 'boxes',
  container: { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 10000 },
  cargo: [{ id: 'A', name: 'real box', length: .5, width: .4, height: .3, weightKg: 10, quantity: 20 }] };
const result = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
const state = window as Window & { __containerLoadingLatestCertification?: InertiaCertification };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); setUiLanguage('ko');
  saveViewerQuality({ quality: 'standard', ambientOcclusion: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); delete state.__containerLoadingLatestCertification;
  localStorage.clear(); sessionStorage.clear(); setUiLanguage('ko'); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<StrictMode><ViewerQualityControls /><ViewerQualityControls /></StrictMode>)); }
async function choose(value: string) { await act(async () => { const select = host.querySelector<HTMLSelectElement>('select')!;
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }

describe('viewer quality controls and state isolation', () => {
  it('synchronizes retained controls and preserves the AO preference through the disabled performance setting', async () => {
    await mount(); const selects = host.querySelectorAll<HTMLSelectElement>('select'), checkboxes = host.querySelectorAll<HTMLInputElement>('input');
    expect(selects).toHaveLength(2); expect(selects[0].value).toBe('standard'); expect(checkboxes[0].checked).toBe(true);
    await choose('performance'); expect([...selects].every(select => select.value === 'performance')).toBe(true);
    expect([...checkboxes].every(input => input.disabled && !input.checked)).toBe(true);
    expect(readViewerQuality().ambientOcclusion).toBe(true);
    await choose('high'); expect(checkboxes[0].disabled).toBe(false); expect(checkboxes[0].checked).toBe(true);
    await act(async () => checkboxes[0].click()); expect([...checkboxes].every(input => !input.checked)).toBe(true);
    expect(readViewerQuality()).toEqual({ quality: 'high', ambientOcclusion: false });
    for (const select of selects) expect(host.querySelector('label[for="' + select.id + '"]')).not.toBeNull();
    expect(selects[0].id).not.toBe(selects[1].id);
  });
  it('responds to matching storage notifications and cleans both subscriptions on unmount', async () => {
    const added = vi.spyOn(window, 'addEventListener'), removed = vi.spyOn(window, 'removeEventListener'); await mount();
    sessionStorage.setItem(VIEWER_QUALITY_KEY, 'high:off');
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: VIEWER_QUALITY_KEY })));
    expect([...host.querySelectorAll('select')].every(select => select.value === 'high')).toBe(true);
    await act(async () => root.render(null));
    for (const [event, listener] of added.mock.calls.filter(([event]) => event === VIEWER_QUALITY_EVENT || event === 'storage')) {
      expect(removed.mock.calls.some(([name, callback]) => name === event && callback === listener)).toBe(true);
    }
    added.mockRestore(); removed.mockRestore();
  });
  it('changes only display settings, leaving work data, identities, target and current certification untouched', async () => {
    writeStoredState({ container: input.container, cargo: input.cargo, result });
    const target = { mode: 'boxes' as const, container: input.container, cargo: input.cargo, result }; publishPhysicsTarget(target);
    // Review-only fixture: this test checks preservation, never creates a dispatch PASS.
    const certification = { status: 'review', targetSignature: 'synthetic-quality-isolation' } as InertiaCertification;
    state.__containerLoadingLatestCertification = certification;
    const saved = JSON.stringify(readStoredState()), signature = stagingInputSignature(input), units = buildStagingInventory(input).units.map(unit => unit.id);
    const events = [APP_ACTION_EVENT, STORAGE_UPDATED_EVENT, LOADING_RESULT_EVENT, PHYSICS_TARGET_EVENT, INERTIA_CERTIFICATION_EVENT];
    const changed = vi.fn(); events.forEach(event => window.addEventListener(event, changed));
    try {
      await mount(); await choose('high'); await act(async () => host.querySelector<HTMLInputElement>('input')!.click()); await choose('performance');
      expect(changed).not.toHaveBeenCalled(); expect(readPhysicsTarget()).toBe(target); expect(readLatestInertiaCertification()).toBe(certification);
      expect(JSON.stringify(readStoredState())).toBe(saved); expect(stagingInputSignature(input)).toBe(signature);
      expect(buildStagingInventory(input).units.map(unit => unit.id)).toEqual(units); expect(result.placements).toEqual([]);
    } finally { events.forEach(event => window.removeEventListener(event, changed)); }
  });
});
