import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { openLoadingReport } from './report';
import { readLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget } from './rule-engine/acceptance';

vi.mock('./report', () => ({ openLoadingReport: vi.fn(() => true) }));

it.each([true, false])('A work order openReport=%s preserves exact accepted placement without repacking or physics', async openReport => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }], result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] } };
  const before = JSON.stringify(target);
  try {
    await act(async () => root.render(<DirectWorkOrderOptimizer />));
    await act(async () => requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport }));
    expect(openLoadingReport).toHaveBeenCalledTimes(openReport ? 1 : 0);
    expect(JSON.stringify(target)).toBe(before);
    expect(isLoadSimAcceptedTarget(target)).toBe(true);
    expect(readLatestInertiaCertification()).toBeUndefined();
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); vi.unstubAllGlobals(); }
});

it('revalidates A geometry before issuing a work order', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<DirectWorkOrderOptimizer />));
    await act(async () => requestDirectWorkOrder({ length: 1, width: 1, height: 1, maxPayloadKg: 10 }, [], { ruleEngine: 'load-sim', placements: [{ cargoId: 'MISSING', x: 0, y: 0, z: 0, length: .4, width: .4, height: .4, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .064, validationIssues: [] }));
    expect(openLoadingReport).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); vi.unstubAllGlobals(); }
});
