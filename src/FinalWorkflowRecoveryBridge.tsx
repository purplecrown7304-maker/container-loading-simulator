import { useEffect, useRef } from 'react';
import { NO_LOAD_RESULT_EVENT } from './autoCertification';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { FINAL_LOADING_WORKFLOW_CANCEL_EVENT, FINAL_LOADING_WORKFLOW_ERROR_EVENT, FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import { getGuidedWorkflowSnapshot } from './guidedWorkflowState';
import { createPhysicsTargetSignature } from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { LOAD_SIM_ACCEPTANCE_EVENT, isLoadSimAcceptedTarget, publishLoadSimAcceptance } from './rule-engine/acceptance';
import { APP_ACTION_EVENT } from './uiEvents';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';

type ResultDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };

function guidedResultButton(target: Element) {
  const button = target.closest('.guided-primary-cta, .guided-step-list button');
  return button instanceof HTMLButtonElement && (button.textContent ?? '').includes('결과 확인') ? button : null;
}

/** Recover a missing final A acceptance event, never launch the retired automatic
 * Rapier/inertia pipeline or accept a certificate for a different layout. */
export default function FinalWorkflowRecoveryBridge() {
  const runId = useRef(0);
  const active = useRef(false);
  const completedEmptySignature = useRef<string | null>(null);
  useEffect(() => {
    const onStart = () => { completedEmptySignature.current = null; runId.current += 1; active.current = true; };
    const onAcceptance = () => { if (readPhysicsTarget()) active.current = false; };
    const onInputChanged = () => { runId.current += 1; active.current = false; completedEmptySignature.current = null; };
    const onNoLoad = (event: Event) => {
      const target = (event as CustomEvent<PhysicsTarget>).detail;
      if (!target || target.result.placements.length || !target.result.remaining.length) return;
      active.current = false;
      completedEmptySignature.current = createPhysicsTargetSignature(target);
    };
    const onLoadingResult = (event: Event) => {
      const detail = (event as CustomEvent<ResultDetail>).detail;
      if (!active.current || !detail) return;
      if (detail.result.ruleEngine !== 'load-sim') { onInputChanged(); return; }
      const id = runId.current;
      const expected: PhysicsTarget = { mode: 'boxes', ...detail };
      window.setTimeout(() => {
        if (!active.current || runId.current !== id || isLoadSimAcceptedTarget(expected)) return;
        publishLoadSimAcceptance(expected);
      }, 650);
    };
    const onGuidedResultClick = (event: MouseEvent) => {
      const guided = getGuidedWorkflowSnapshot();
      if (!guided.active || guided.step !== 5 || !(event.target instanceof Element)) return;
      const button = guidedResultButton(event.target);
      const current = readPhysicsTarget();
      if (!button || button.disabled || isLoadSimAcceptedTarget(current)) return;
      if (current && !current.result.placements.length && completedEmptySignature.current === createPhysicsTargetSignature(current)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (!active.current) window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
    };
    window.addEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
    window.addEventListener(FINAL_LOADING_WORKFLOW_CANCEL_EVENT, onInputChanged);
    window.addEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputChanged);
    window.addEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onInputChanged);
    window.addEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    window.addEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
    window.addEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
    document.addEventListener('click', onGuidedResultClick, true);
    return () => {
      runId.current += 1; active.current = false;
      window.removeEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
      window.removeEventListener(FINAL_LOADING_WORKFLOW_CANCEL_EVENT, onInputChanged);
      window.removeEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputChanged);
      window.removeEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onInputChanged);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoadingResult);
      window.removeEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
      window.removeEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
      document.removeEventListener('click', onGuidedResultClick, true);
    };
  }, []);
  return null;
}
