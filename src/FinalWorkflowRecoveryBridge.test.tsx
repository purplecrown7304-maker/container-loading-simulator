import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import FinalWorkflowRecoveryBridge from './FinalWorkflowRecoveryBridge';
import { loadContainer, publishLoadingResult } from './engine/loadingEngine';
import { FINAL_LOADING_WORKFLOW_CANCEL_EVENT, FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import { clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget, readLoadSimAcceptance } from './rule-engine/acceptance';
import { clearLatestInertiaCertification, readLatestInertiaCertification } from './inertiaCertification';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';

const container = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 2 }];

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearPhysicsTarget(); clearLoadSimAcceptance(); clearLatestInertiaCertification(); });

it.each([undefined, WORKFLOW_INPUT_INVALIDATED_EVENT, FINAL_LOADING_WORKFLOW_CANCEL_EVENT])('recovers only an unchanged final A result (interruption=%s)', async interruption => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers();
  clearPhysicsTarget(); clearLoadSimAcceptance(); clearLatestInertiaCertification();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const target: PhysicsTarget = { mode: 'boxes', container, cargo, result: loadContainer(container, cargo, { publish: false }) };
  try {
    await act(async () => root.render(<FinalWorkflowRecoveryBridge />));
    await act(async () => {
      window.dispatchEvent(new CustomEvent(FINAL_LOADING_WORKFLOW_START_EVENT));
      publishLoadingResult(container, cargo, target.result);
      if (interruption) window.dispatchEvent(new CustomEvent(interruption));
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(isLoadSimAcceptedTarget(target)).toBe(!interruption);
    expect(readLoadSimAcceptance()?.status).toBe(interruption ? undefined : 'accepted');
    expect(readLatestInertiaCertification()).toBeUndefined();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
