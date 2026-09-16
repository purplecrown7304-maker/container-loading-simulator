import { createExternalStore } from './store/externalStore';

export type GuidedWorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;

export type GuidedWorkflowSnapshot = {
  active: boolean;
  step: GuidedWorkflowStep;
};

const DEFAULT_SNAPSHOT: GuidedWorkflowSnapshot = { active: false, step: 1 };
const store = createExternalStore<GuidedWorkflowSnapshot>(DEFAULT_SNAPSHOT);

export function normalizeGuidedWorkflowStep(value: string | number | undefined): GuidedWorkflowStep {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric as GuidedWorkflowStep : 1;
}

export function publishGuidedWorkflowState(next: GuidedWorkflowSnapshot) {
  const normalized: GuidedWorkflowSnapshot = {
    active: Boolean(next.active),
    step: normalizeGuidedWorkflowStep(next.step),
  };
  store.setSnapshot(current => current.active === normalized.active && current.step === normalized.step ? current : normalized);

  // CSS는 아직 가이드 전용 전역 스타일을 위해 data attribute를 읽는다.
  // 단, 상태의 원본은 React 외부 store이며 DOM attribute를 다시 읽어 상태를 만들지는 않는다.
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (normalized.active) {
    root.dataset.guidedWorkflow = 'true';
    root.dataset.guidedStep = String(normalized.step);
  } else {
    delete root.dataset.guidedWorkflow;
    delete root.dataset.guidedStep;
  }
}

export function shouldRenderGuidedViewer(state: GuidedWorkflowSnapshot) {
  return !state.active || state.step === 5;
}

export function subscribeGuidedWorkflow(listener: () => void) {
  return store.subscribe(listener);
}

export function getGuidedWorkflowSnapshot() {
  return store.getSnapshot();
}

export function useGuidedWorkflowState() {
  return store.useSnapshot();
}
