import { describe, expect, it } from 'vitest';
import { resolveOptimizationStrategies } from './physicsOptimizer';

describe('resolveOptimizationStrategies', () => {
  it('keeps automatic comparison when no strategy is selected', () => {
    expect(resolveOptimizationStrategies()).toEqual(['stability', 'capacity', 'unloading']);
  });

  it('runs only the strategy selected in the guided workflow', () => {
    expect(resolveOptimizationStrategies('stability')).toEqual(['stability']);
    expect(resolveOptimizationStrategies('capacity')).toEqual(['capacity']);
    expect(resolveOptimizationStrategies('unloading')).toEqual(['unloading']);
  });
});
