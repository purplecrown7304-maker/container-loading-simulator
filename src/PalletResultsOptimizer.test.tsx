import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PalletResultsOptimizer from './PalletResultsOptimizer';
import { applyPalletAdaptiveCandidate, baselinePalletCandidate, buildPalletAdaptiveCandidates, readPalletSnapshot } from './engine/palletAdaptiveSearch';
import { buildSecuringUsage, createPhysicsTargetSignature, runInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal, REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT } from './resultsModalEvents';

vi.mock('./engine/palletAdaptiveSearch', async importOriginal => ({ ...await importOriginal<object>(), applyPalletAdaptiveCandidate: vi.fn(), baselinePalletCandidate: vi.fn(), buildPalletAdaptiveCandidates: vi.fn(), readPalletSnapshot: vi.fn() }));
vi.mock('./inertiaCertification', async importOriginal => ({ ...await importOriginal<object>(), runInertiaCertification: vi.fn() }));
vi.mock('./resultsModalEvents', async importOriginal => ({ ...await importOriginal<object>(), openResultsModal: vi.fn() }));

it('never reopens results or re-enters optimization for inertia PASS with a hard static error', async () => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [], operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 초과', placementIndexes: [] }] } };
  const cert: InertiaCertification = { mode: 'pallets', status: 'passed', targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, 0), testedAt: '', testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .005, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) };
  const snapshot = {} as NonNullable<ReturnType<typeof readPalletSnapshot>>;
  vi.mocked(readPalletSnapshot).mockReturnValue(snapshot);
  vi.mocked(baselinePalletCandidate).mockReturnValue({ target, spec: snapshot.spec, result: snapshot.result, label: 'baseline', staticPenalty: 0 });
  vi.mocked(buildPalletAdaptiveCandidates).mockReturnValue([]);
  vi.mocked(runInertiaCertification).mockResolvedValue(cert);
  try {
    await act(async () => { root.render(<PalletResultsOptimizer />); });
    await act(async () => { publishPhysicsTarget(target); window.dispatchEvent(new CustomEvent(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, { detail: target })); });
    expect(runInertiaCertification).toHaveBeenCalledOnce();
    expect(applyPalletAdaptiveCandidate).toHaveBeenCalledOnce();
    expect(openResultsModal).not.toHaveBeenCalled();
    expect(host.textContent).toContain('잠금 상태');
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); }
});
