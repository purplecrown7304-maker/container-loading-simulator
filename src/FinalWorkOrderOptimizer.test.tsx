import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FinalWorkOrderOptimizer from './FinalWorkOrderOptimizer';
import { applyPalletAdaptiveCandidate, baselinePalletCandidate, buildPalletAdaptiveCandidates, readPalletSnapshot, type PalletAdaptiveCandidate } from './engine/palletAdaptiveSearch';
import { buildSecuringUsage, createPhysicsTargetSignature, runInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { completeCertificationForWorkOrder } from './inertiaWorkOrderPolicy';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openPalletLoadingReport } from './palletWorkerReportV2';
import { REQUEST_FINAL_WORK_ORDER_EVENT } from './finalWorkOrderEvents';
import { defaultPalletSpec, type OptimizedPalletPackingResult } from './engine/palletOptimization';

vi.mock('./engine/palletAdaptiveSearch', async importOriginal => ({ ...await importOriginal<object>(), applyPalletAdaptiveCandidate: vi.fn(), baselinePalletCandidate: vi.fn(), buildPalletAdaptiveCandidates: vi.fn(), readPalletSnapshot: vi.fn() }));
vi.mock('./inertiaCertification', async importOriginal => ({ ...await importOriginal<object>(), runInertiaCertification: vi.fn() }));
vi.mock('./inertiaWorkOrderPolicy', async importOriginal => ({ ...await importOriginal<object>(), completeCertificationForWorkOrder: vi.fn() }));
vi.mock('./palletWorkerReportV2', () => ({ openPalletLoadingReport: vi.fn() }));

let host: HTMLDivElement, root: Root;
const target: PhysicsTarget = { mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [], operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 초과', placementIndexes: [] }] } };
function certification(current: PhysicsTarget): InertiaCertification { return { mode: 'pallets', status: 'passed', targetSignature: createPhysicsTargetSignature(current), securing: buildSecuringUsage(current, 0), testedAt: '', testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .005, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) }; }
function candidate(current: PhysicsTarget): PalletAdaptiveCandidate { return { target: current, spec: defaultPalletSpec, result: { optimization: { strategy: 'capacity' }, palletCount: 1 } as OptimizedPalletPackingResult, label: '검토 후보', staticPenalty: 0 }; }
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(readPalletSnapshot).mockReturnValue({ spec: defaultPalletSpec, result: candidate(target).result });
  vi.mocked(baselinePalletCandidate).mockReturnValue(candidate(target));
  vi.mocked(buildPalletAdaptiveCandidates).mockReturnValue([]);
  vi.mocked(runInertiaCertification).mockImplementation(async current => certification(current));
  vi.mocked(completeCertificationForWorkOrder).mockImplementation(async (_target, cert) => cert);
  vi.mocked(openPalletLoadingReport).mockReturnValue(false);
  await act(async () => root.render(<FinalWorkOrderOptimizer />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); });
async function request() { await act(async () => { publishPhysicsTarget(target); window.dispatchEvent(new CustomEvent(REQUEST_FINAL_WORK_ORDER_EVENT, { detail: target })); }); }

it('keeps static-failed inertia PASS as review output with no PASS label when popup is blocked', async () => {
  await request();
  expect(openPalletLoadingReport).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('적재 제약 실패 · 검토용 작업지시서');
  expect(host.textContent).not.toContain('작업지시서 PASS');
});

it('continues past an inertia PASS with static errors to a statically valid candidate', async () => {
  const valid: PhysicsTarget = { ...target, result: { ...target.result, placements: [{ ...target.result.placements[0], x: 1 }], operationalFindings: [] } };
  vi.mocked(buildPalletAdaptiveCandidates).mockReturnValue([candidate(valid)]);
  await request();
  expect(runInertiaCertification).toHaveBeenCalledTimes(2);
  expect(applyPalletAdaptiveCandidate).toHaveBeenCalledWith(candidate(valid), expect.objectContaining({ targetSignature: createPhysicsTargetSignature(valid) }));
  expect(openPalletLoadingReport).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('작업지시서 PASS');
});
