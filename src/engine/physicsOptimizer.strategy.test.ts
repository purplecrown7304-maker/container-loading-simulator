import { describe, expect, it } from 'vitest';
import { resolveOptimizationStrategies } from './physicsOptimizer';

describe('resolveOptimizationStrategies', () => {
  it('runs one canonical load-sim layout when no legacy strategy is selected', () => {
    expect(resolveOptimizationStrategies()).toEqual(['capacity']);
  });

  it('keeps a legacy strategy token only for API compatibility', () => {
    expect(resolveOptimizationStrategies('stability')).toEqual(['stability']);
    expect(resolveOptimizationStrategies('capacity')).toEqual(['capacity']);
    expect(resolveOptimizationStrategies('unloading')).toEqual(['unloading']);
  });
});
