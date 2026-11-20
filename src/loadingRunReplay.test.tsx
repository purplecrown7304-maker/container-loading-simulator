import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import ConfirmedPackagingLoadingBridge from './ConfirmedPackagingLoadingBridge';
import type { ContainerSpec } from './engine/types';
import EquipmentLoadingConsistencyGuard from './EquipmentLoadingConsistencyGuard';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { setLoadingRuleset } from './loadingRulesPreference';
import { cargoFromProductPackaging } from './productWorkflow';
import { readDiagnosticTrace } from './runtimeDiagnostics';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, writeStoredState } from './storage';
import { readTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT } from './uiEvents';

/**
 * Two guards hold a "run loading" request back for two frames and issue it again. A request is
 * made for the rules and the job of that moment: if they change while it is held, replaying it
 * would plan and verify an input nobody asked to run (seen on a slow runner: the operator
 * switched the rule set right after pressing run, and the run started under the other rules).
 */
const products = [{ id: 'SLAB', name: '슬래브', length: 1, width: 2.3, height: .5, weightKg: 4, quantity: 6, requiresBoxPackaging: false }] as CompanyProductItem[];
let frames: FrameRequestCallback[];
let root: Root;
let host: HTMLDivElement;

const flushFrames = async () => { await act(async () => { while (frames.length) frames.shift()!(0); }); };
/** Dispatches the request and returns what reached the app: nothing while a guard holds it. */
function pressRun() {
  const reached: Array<Record<string, unknown>> = [];
  const listen = (event: Event) => reached.push((event as CustomEvent).detail);
  window.addEventListener(APP_ACTION_EVENT, listen);
  window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
  return { reached, stop: () => window.removeEventListener(APP_ACTION_EVENT, listen) };
}
const dropped = () => readDiagnosticTrace().filter(entry => entry.event === 'run-loading-replay-dropped').length;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  setLoadingRuleset('legacy');
  publishGuidedLoadingUnit('boxes');
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); publishGuidedLoadingUnit(null); vi.unstubAllGlobals(); });

describe('the confirmed-packaging guard replays a run request only for the job it was made for', () => {
  beforeEach(async () => {
    const equipment = readTransportEquipment();
    const container: ContainerSpec = { length: equipment.length, width: equipment.width, height: equipment.height, maxPayloadKg: equipment.maxPayloadKg, floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2 };
    const cargo = cargoFromProductPackaging(products, []);
    writeShipmentInstructionSnapshot(products, [], cargo);
    writeStoredState({ container, cargo });
    await act(async () => root.render(<ConfirmedPackagingLoadingBridge />));
  });

  it('replays the request when nothing changed', async () => {
    const before = dropped();
    const run = pressRun();
    expect(run.reached).toEqual([]);
    await flushFrames();
    run.stop();
    expect(run.reached).toEqual([{ action: 'run-loading', confirmedPackagingReplay: true }]);
    expect(dropped()).toBe(before);
  });

  it.each([
    ['the rule set', () => setLoadingRuleset('a-v1')],
    ['the loading type', () => publishGuidedLoadingUnit('pallets')],
    ['the job cargo', () => writeStoredState({ ...readStoredState()!, cargo: readStoredState()!.cargo.map(item => ({ ...item, quantity: item.quantity + 1 })) })],
  ])('withdraws the request when %s changed while it was held', async (_what, change) => {
    const before = dropped();
    const run = pressRun();
    change();
    await flushFrames();
    run.stop();
    expect(run.reached).toEqual([]);
    expect(dropped()).toBe(before + 1);
  });

  it('is not disturbed by a plan the app saves beside the job while the request is held', async () => {
    const run = pressRun();
    const stored = readStoredState()!;
    writeStoredState({ ...stored, result: { placements: [], remaining: [], validationIssues: [], loadedWeightKg: 0, usedVolumeM3: 0 } });
    await flushFrames();
    run.stop();
    expect(run.reached).toEqual([{ action: 'run-loading', confirmedPackagingReplay: true }]);
  });
});

describe('the equipment guard replays a run request only for the job it corrected', () => {
  beforeEach(async () => {
    // A stored container that is not the selected equipment: the guard corrects it and replays.
    writeStoredState({ container: { length: 3, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: cargoFromProductPackaging(products, []) });
    await act(async () => root.render(<EquipmentLoadingConsistencyGuard />));
  });

  it('corrects the stored equipment and replays', async () => {
    const run = pressRun();
    expect(run.reached).toEqual([]);
    expect(readStoredState()!.container.length).toBe(readTransportEquipment().length);
    await flushFrames();
    run.stop();
    expect(run.reached).toEqual([{ action: 'run-loading', equipmentConsistencyReplay: true }]);
  });

  it('withdraws the request when the rule set changed while it was held', async () => {
    const before = dropped();
    const run = pressRun();
    setLoadingRuleset('a-v1');
    await flushFrames();
    run.stop();
    expect(run.reached).toEqual([]);
    expect(dropped()).toBe(before + 1);
  });
});
