import type { LoadingStrategy } from './engine/loadingStrategies';

export type LoadingMode = 'boxes' | 'pallets';
export type LoadingWorkflowPhase =
  | 'idle'
  | 'candidate-generation'
  | 'static-validation'
  | 'physics-validation'
  | 'inertia-validation'
  | 'rearranging'
  | 'revalidation'
  | 'finalizing'
  | 'complete'
  | 'failed';

export type LoadingWorkflowProgress = {
  mode: LoadingMode;
  strategy: LoadingStrategy;
  phase: LoadingWorkflowPhase;
  percent: number;
  title: string;
  detail?: string;
  attempt?: number;
  attemptTotal?: number;
};

export const LOADING_WORKFLOW_EVENT = 'container-loading:workflow-progress';

let latest: LoadingWorkflowProgress | null = null;

export function publishLoadingWorkflowProgress(progress: LoadingWorkflowProgress) {
  latest = { ...progress, percent: Math.max(0, Math.min(100, progress.percent)) };
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent<LoadingWorkflowProgress>(LOADING_WORKFLOW_EVENT, { detail: latest }));
  }
  return latest;
}

export function readLoadingWorkflowProgress() {
  return latest;
}

export function clearLoadingWorkflowProgress() {
  latest = null;
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent<LoadingWorkflowProgress | null>(LOADING_WORKFLOW_EVENT, { detail: null }));
  }
}
