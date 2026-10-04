import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FinalCertificationGate from './FinalCertificationGate';
import { requestCertifiedResults, readLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget } from './rule-engine/acceptance';

vi.mock('./resultsModalEvents', () => ({ openResultsModal: vi.fn() }));

it.each([true, false])('A automatic=%s keeps optional inertia separate and opens only requested results', async automatic => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }], result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] } };
  try {
    await act(async () => root.render(<FinalCertificationGate />));
    await act(async () => requestCertifiedResults({ ...target, automatic }));
    expect(openResultsModal).toHaveBeenCalledTimes(automatic ? 0 : 1);
    expect(isLoadSimAcceptedTarget(target)).toBe(true);
    expect(readLatestInertiaCertification()).toBeUndefined();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); vi.unstubAllGlobals(); }
});
