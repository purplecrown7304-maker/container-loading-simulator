import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FinalCertificationGate from './FinalCertificationGate';
import { REQUEST_CERTIFIED_RESULTS_EVENT, runInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import type { LoadingResult } from './engine/types';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget } from './rule-engine/acceptance';
import { publishLoadSimAcceptance } from './rule-engine/acceptance';
import { readPhysicsTarget } from './physicsTarget';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import { REQUEST_DIRECT_WORK_ORDER_EVENT } from './directWorkOrderEvents';
import { pendingLoadingResult, publishLoadingResult } from './engine/loadingEngine';

vi.mock('./inertiaCertification', async importOriginal => ({ ...await importOriginal<object>(), runInertiaCertification: vi.fn() }));
vi.mock('./resultsModalEvents', () => ({ openResultsModal: vi.fn() }));

it.each<Partial<LoadingResult>>([{ validationIssues: [{ type: 'COLLISION', message: 'Collision', placementIndexes: [0] }] }, { operationalFindings: [{ code: 'OVERLAP', severity: 'error', message: 'Collision', placementIndexes: [0] }] }])('rejects direct certification events before simulation or cached-pass use: %j', async patch => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = {
    mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [],
    result: { placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [], ...patch },
  };
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => {
      publishPhysicsTarget(target);
      window.dispatchEvent(new CustomEvent(REQUEST_CERTIFIED_RESULTS_EVENT, { detail: target }));
    });
    expect(runInertiaCertification).not.toHaveBeenCalled();
    expect(openResultsModal).not.toHaveBeenCalled();
    expect(host.textContent).toContain('적재 규칙');
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); }
});

it('opens an A-valid result directly without old inertia/repacking', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = {
    mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }],
    result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] },
  };
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => { publishPhysicsTarget(target); window.dispatchEvent(new CustomEvent(REQUEST_CERTIFIED_RESULTS_EVENT, { detail: target })); });
    expect(runInertiaCertification).not.toHaveBeenCalled();
    expect(openResultsModal).toHaveBeenCalledOnce();
    expect(isLoadSimAcceptedTarget(target)).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); vi.unstubAllGlobals(); }
});

it.each([REQUEST_CERTIFIED_RESULTS_EVENT, REQUEST_DIRECT_WORK_ORDER_EVENT])('rejects stale %s before overwriting the active accepted source', async eventName => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const current: PhysicsTarget = {
    mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'CURRENT', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }],
    result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] },
  };
  const stale = { ...current, cargo: [{ ...current.cargo[0], name: 'OLD' }] };
  try {
    await act(async () => root.render(<><FinalCertificationGate /><DirectWorkOrderOptimizer /></>));
    await act(async () => { publishLoadSimAcceptance(current); window.dispatchEvent(new CustomEvent(eventName, { detail: stale })); });
    expect(readPhysicsTarget()).toBe(current);
    expect(isLoadSimAcceptedTarget(current)).toBe(true);
    expect(openResultsModal).not.toHaveBeenCalled();
    expect(host.textContent).toContain('최신 결과');
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); vi.unstubAllGlobals(); }
});

it.each([REQUEST_CERTIFIED_RESULTS_EVENT, REQUEST_DIRECT_WORK_ORDER_EVENT])('rejects stale %s after the viewer target is cleared and source quantity changes', async eventName => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const old: PhysicsTarget = {
    mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }],
    result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] },
  };
  try {
    await act(async () => root.render(<><FinalCertificationGate /><DirectWorkOrderOptimizer /></>));
    await act(async () => {
      publishLoadingResult(old.container, old.cargo, old.result);
      publishLoadSimAcceptance(old);
      clearPhysicsTarget();
      pendingLoadingResult(old.container, [{ ...old.cargo[0], quantity: 9 }]);
      window.dispatchEvent(new CustomEvent(eventName, { detail: old }));
    });
    expect(readPhysicsTarget()).toBeUndefined();
    expect(openResultsModal).not.toHaveBeenCalled();
    expect(host.textContent).toContain('최신 결과');
  } finally {
    await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance();
    delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
    vi.unstubAllGlobals();
  }
});
