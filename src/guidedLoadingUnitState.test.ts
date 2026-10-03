import { describe, expect, it } from 'vitest';
import { guidedLoadingUnitLabel, normalizeGuidedLoadingUnit } from './guidedLoadingUnitState';

describe('guided loading unit state', () => {
  it('normalizes legacy global modes into the single load-sim mode', () => {
    expect(normalizeGuidedLoadingUnit('boxes')).toBe('boxes');
    expect(normalizeGuidedLoadingUnit('pallets')).toBe('boxes');
    expect(normalizeGuidedLoadingUnit('box')).toBeNull();
    expect(normalizeGuidedLoadingUnit('')).toBeNull();
    expect(normalizeGuidedLoadingUnit(undefined)).toBeNull();
  });

  it('provides the load-sim operator-facing label', () => {
    expect(guidedLoadingUnitLabel('boxes')).toBe('load-sim 규칙 기반');
    expect(guidedLoadingUnitLabel(null)).toBe('적재 유형 준비 중');
  });
});
