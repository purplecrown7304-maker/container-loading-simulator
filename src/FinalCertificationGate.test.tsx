import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FinalCertificationGate from './FinalCertificationGate';
import { requestCertifiedResults, runInertiaCertification, type CertificationProgress, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';

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
