import { describe, expect, it } from 'vitest';
import { LOADING_STRATEGIES, basePackingStrategy, normalizeLoadingStrategy } from './loadingStrategies';

describe('loading strategies', () => {
  it('exposes six unique user-selectable strategies', () => {
    const ids = LOADING_STRATEGIES.map((item) => item.id);
    expect(ids).toEqual(['balanced', 'capacity', 'stability', 'center-of-gravity', 'floor-balance', 'unloading']);
    expect(new Set(ids).size).toBe(6);
  });

  it('maps six strategies onto the preserved PR #50 base solvers', () => {
    expect(basePackingStrategy('capacity')).toBe('capacity');
    expect(basePackingStrategy('unloading')).toBe('unloading');
    expect(basePackingStrategy('balanced')).toBe('stability');
    expect(basePackingStrategy('stability')).toBe('stability');
    expect(basePackingStrategy('center-of-gravity')).toBe('stability');
    expect(basePackingStrategy('floor-balance')).toBe('stability');
  });

  it('falls back to balanced for unknown stored values', () => {
    expect(normalizeLoadingStrategy('legacy-value')).toBe('balanced');
    expect(normalizeLoadingStrategy(null)).toBe('balanced');
  });
});