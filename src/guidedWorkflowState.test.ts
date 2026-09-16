import { describe, expect, it } from 'vitest';
import { normalizeGuidedWorkflowStep, shouldRenderGuidedViewer } from './guidedWorkflowState';

describe('guided workflow step normalization', () => {
  it('accepts only integer steps 1 through 6', () => {
    expect(normalizeGuidedWorkflowStep('1')).toBe(1);
    expect(normalizeGuidedWorkflowStep('4')).toBe(4);
    expect(normalizeGuidedWorkflowStep(5)).toBe(5);
    expect(normalizeGuidedWorkflowStep('6')).toBe(6);
  });

  it('falls back to step 1 for invalid or fractional values', () => {
    expect(normalizeGuidedWorkflowStep(undefined)).toBe(1);
    expect(normalizeGuidedWorkflowStep('')).toBe(1);
    expect(normalizeGuidedWorkflowStep('0')).toBe(1);
    expect(normalizeGuidedWorkflowStep('7')).toBe(1);
    expect(normalizeGuidedWorkflowStep('2.5')).toBe(1);
    expect(normalizeGuidedWorkflowStep('abc')).toBe(1);
  });
});

describe('guided viewer rendering', () => {
  it('keeps the normal dashboard viewer when guided workflow is inactive', () => {
    expect(shouldRenderGuidedViewer({ active: false, step: 1 })).toBe(true);
  });

  it('renders the dashboard 3D viewer only during guided auto-loading step', () => {
    for (const step of [1, 2, 3, 4, 6] as const) {
      expect(shouldRenderGuidedViewer({ active: true, step })).toBe(false);
    }
    expect(shouldRenderGuidedViewer({ active: true, step: 5 })).toBe(true);
  });
});
