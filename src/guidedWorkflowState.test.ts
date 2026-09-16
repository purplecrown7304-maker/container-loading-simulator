import { describe, expect, it } from 'vitest';
import { normalizeGuidedWorkflowStep } from './guidedWorkflowState';

describe('guided workflow step normalization', () => {
  it('accepts only integer steps 1 through 6', () => {
    expect(normalizeGuidedWorkflowStep('1')).toBe(1);
    expect(normalizeGuidedWorkflowStep('4')).toBe(4);
    expect(normalizeGuidedWorkflowStep('6')).toBe(6);
  });

  it('falls back to step 1 for invalid or fractional values', () => {
    expect(normalizeGuidedWorkflowStep(undefined)).toBe(1);
    expect(normalizeGuidedWorkflowStep('0')).toBe(1);
    expect(normalizeGuidedWorkflowStep('7')).toBe(1);
    expect(normalizeGuidedWorkflowStep('2.5')).toBe(1);
    expect(normalizeGuidedWorkflowStep('abc')).toBe(1);
  });
});
