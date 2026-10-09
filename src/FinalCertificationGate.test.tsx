import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FinalCertificationGate from './FinalCertificationGate';
import { requestCertifiedResults, runInertiaCertification, createPhysicsTargetSignature, buildSecuringUsage, type CertificationProgress, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { buildDirectResultReoptimizationCandidatesAsync, buildSecuringPayloadAdjustmentCandidateAsync } from './engine/finalResultOptimization';
import { WORKFLOW_VERIFICATION_CANCELLED_EVENT } from './workflowVerificationState';

vi.mock('./engine/finalResultOptimization', async importOriginal => ({ ...await importOriginal<object>(), buildDirectResultReoptimizationCandidatesAsync: vi.fn(), buildSecuringPayloadAdjustmentCandidateAsync: vi.fn() }));
vi.mock('./inertiaCertification', async importOriginal => ({ ...await importOriginal<object>(), runInertiaCertification: vi.fn() }));
vi.mock('./resultsModalEvents', () => ({ openResultsModal: vi.fn() }));

it('closes obsolete certification UI and ignores late progress/completion after input changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  let resolve!: (value: InertiaCertification) => void;
  let progress!: (value: CertificationProgress) => void;
  let cancelled!: () => boolean;
  vi.mocked(runInertiaCertification).mockImplementation((_target, onProgress, _onResult, isCancelled) => {
    progress = onProgress!; cancelled = isCancelled!;
    return new Promise(done => { resolve = done; });
  });
  const target: PhysicsTarget = { mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [],
  } };
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => { publishPhysicsTarget(target); requestCertifiedResults(target); });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new CustomEvent(WORKFLOW_INPUT_INVALIDATED_EVENT)));
    expect(cancelled()).toBe(true); expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      progress({ level: 1, levelLabel: 'old', scenario: 'braking', scenarioIndex: 2, scenarioCount: 3, physicsProgress: .8 });
      resolve({} as InertiaCertification);
    });
    expect(openResultsModal).not.toHaveBeenCalled(); expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals();
  }
});


it.each([true, false])('automatic=%s preserves the canvas while manual certification still opens results', async automatic => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [],
  } };
  const passed: InertiaCertification = { mode: 'pallets', status: 'passed', targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, 0), testedAt: new Date(0).toISOString(), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .005, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) };
  vi.mocked(runInertiaCertification).mockResolvedValue(passed);
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => { publishPhysicsTarget(target); requestCertifiedResults({ ...target, automatic }); });
    expect(runInertiaCertification).toHaveBeenCalledOnce();
    expect(openResultsModal).toHaveBeenCalledTimes(automatic ? 0 : 1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); }
});

it('publishes explicit operator cancellation while keeping input invalidation separate', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] } };
  const cancel = vi.fn();
  window.addEventListener(WORKFLOW_VERIFICATION_CANCELLED_EVENT, cancel);
  vi.mocked(runInertiaCertification).mockImplementation(() => new Promise(() => {}));
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => { publishPhysicsTarget(target); requestCertifiedResults(target); });
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '계산 취소')!.click());
    expect(cancel).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => requestCertifiedResults(target));
    await act(async () => window.dispatchEvent(new Event(WORKFLOW_INPUT_INVALIDATED_EVENT)));
    expect(cancel).toHaveBeenCalledOnce();
  } finally { window.removeEventListener(WORKFLOW_VERIFICATION_CANCELLED_EVENT, cancel); await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); }
});

it.each([true, false])('retries securing-payload failure once and prefers its payload-valid candidate (pass=%s)', async passed => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 99 }], remaining: [], loadedWeightKg: 99, usedVolumeM3: .027, validationIssues: [] } };
  const failed: InertiaCertification = { mode: 'boxes', status: 'failed', targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, 3), testedAt: new Date(0).toISOString(), testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'], payloadWithinLimit: false, maxHorizontalShiftM: 0, maxTiltDeg: 0, results: {} };
  const result = { ...target.result, loadedWeightKg: 50, placements: [{ ...target.result.placements[0], weightKg: 50 }], remaining: [{ cargoId: 'B', quantity: 1, reason: '보강재 중량 확보' }] };
  const adjusted: PhysicsTarget = { ...target, result };
  const shift = passed ? .005 : .05;
  const certification: InertiaCertification = { ...failed, status: passed ? 'passed' : 'failed', payloadWithinLimit: true, testedScenarios: 3, passedScenarios: passed ? 3 : 0, failedScenarios: passed ? [] : ['acceleration', 'braking', 'cornering'], targetSignature: createPhysicsTargetSignature(adjusted), maxHorizontalShiftM: shift, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: shift, maxTiltDeg: .5 }])) };
  vi.mocked(buildSecuringPayloadAdjustmentCandidateAsync).mockResolvedValue({ target: adjusted, result, label: '보강재 확보', staticPenalty: 0 });
  vi.mocked(runInertiaCertification).mockResolvedValueOnce(failed).mockResolvedValueOnce(certification);
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => { publishPhysicsTarget(target); requestCertifiedResults({ ...target, automatic: true }); });
    expect(buildSecuringPayloadAdjustmentCandidateAsync).toHaveBeenCalledOnce();
    expect(buildDirectResultReoptimizationCandidatesAsync).not.toHaveBeenCalled();
    expect(runInertiaCertification).toHaveBeenCalledTimes(2);
    const published = (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification!;
    expect(published.targetSignature).toBe(certification.targetSignature);
    expect(published.payloadWithinLimit).toBe(true);
    expect(published.searchNotice).toContain('미적재');
    expect(openResultsModal).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); }
});
