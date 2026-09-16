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

export function normalizeGuidedWorkflowStep(value: string | number | undefined): GuidedWorkflowStep {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric as GuidedWorkflowStep : 1;
}

function notifyIfChanged(next: GuidedWorkflowSnapshot) {
  if (next.active === snapshot.active && next.step === snapshot.step) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

function readDocumentSnapshot(): GuidedWorkflowSnapshot {
  if (typeof document === 'undefined') return snapshot;
  const root = document.documentElement;
  return {
    active: root.dataset.guidedWorkflow === 'true',
    step: normalizeGuidedWorkflowStep(root.dataset.guidedStep),
  };
}

function emitDocumentSnapshot() {
  notifyIfChanged(readDocumentSnapshot());
}

function ensureObserver() {
  if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(emitDocumentSnapshot);
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

export function publishGuidedWorkflowState(next: GuidedWorkflowSnapshot) {
  const normalized: GuidedWorkflowSnapshot = {
    active: Boolean(next.active),
    step: normalizeGuidedWorkflowStep(next.step),
  };
  notifyIfChanged(normalized);

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
  listeners.add(listener);
  ensureObserver();
  emitDocumentSnapshot();
  return () => {
    listeners.delete(listener);
    stopObserverIfIdle();
  };
}

export function getGuidedWorkflowSnapshot() {
  return snapshot;
}

export function useGuidedWorkflowState() {
  return useSyncExternalStore(
    subscribeGuidedWorkflow,
    getGuidedWorkflowSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
}
