import { useSyncExternalStore } from 'react';

export type GuidedWorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;

export type GuidedWorkflowSnapshot = {
  active: boolean;
  step: GuidedWorkflowStep;
};

const DEFAULT_SNAPSHOT: GuidedWorkflowSnapshot = { active: false, step: 1 };
let snapshot: GuidedWorkflowSnapshot = DEFAULT_SNAPSHOT;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();

export function normalizeGuidedWorkflowStep(value: string | undefined): GuidedWorkflowStep {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric as GuidedWorkflowStep : 1;
}

function readDocumentSnapshot(): GuidedWorkflowSnapshot {
  if (typeof document === 'undefined') return DEFAULT_SNAPSHOT;
  const root = document.documentElement;
  return {
    active: root.dataset.guidedWorkflow === 'true',
    step: normalizeGuidedWorkflowStep(root.dataset.guidedStep),
  };
}

function emitIfChanged() {
  const next = readDocumentSnapshot();
  if (next.active === snapshot.active && next.step === snapshot.step) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

function ensureObserver() {
  if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  snapshot = readDocumentSnapshot();
  observer = new MutationObserver(emitIfChanged);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-guided-workflow', 'data-guided-step'],
  });
}

function stopObserverIfIdle() {
  if (listeners.size > 0 || !observer) return;
  observer.disconnect();
  observer = null;
}

export function subscribeGuidedWorkflow(listener: () => void) {
  listeners.add(listener);
  ensureObserver();
  emitIfChanged();
  return () => {
    listeners.delete(listener);
    stopObserverIfIdle();
  };
}

export function getGuidedWorkflowSnapshot() {
  if (typeof document !== 'undefined' && !observer) snapshot = readDocumentSnapshot();
  return snapshot;
}

export function useGuidedWorkflowState() {
  return useSyncExternalStore(
    subscribeGuidedWorkflow,
    getGuidedWorkflowSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
}
