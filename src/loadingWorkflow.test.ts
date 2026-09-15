import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOADING_WORKFLOW_EVENT,
  clearLoadingWorkflowProgress,
  publishLoadingWorkflowProgress,
  readLoadingWorkflowProgress,
} from './loadingWorkflow';

afterEach(() => clearLoadingWorkflowProgress());

describe('loading workflow progress', () => {
  it('publishes actual phase changes and stores the latest phase', () => {
    const listener = vi.fn();
    window.addEventListener(LOADING_WORKFLOW_EVENT, listener);
    publishLoadingWorkflowProgress({
      mode: 'boxes',
      strategy: 'stability',
      phase: 'physics-validation',
      percent: 63,
      title: 'Rapier 물리 검증',
    });
    expect(readLoadingWorkflowProgress()?.phase).toBe('physics-validation');
    expect(readLoadingWorkflowProgress()?.percent).toBe(63);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(LOADING_WORKFLOW_EVENT, listener);
  });

  it('clamps progress into the visible 0-100 range', () => {
    publishLoadingWorkflowProgress({ mode: 'pallets', strategy: 'balanced', phase: 'revalidation', percent: 145, title: '재검증' });
    expect(readLoadingWorkflowProgress()?.percent).toBe(100);
  });
});