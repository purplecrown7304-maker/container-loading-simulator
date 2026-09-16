import { describe, expect, it } from 'vitest';
import { guidedLoadingUnitLabel, normalizeGuidedLoadingUnit } from './guidedLoadingUnitState';

describe('guided loading unit state', () => {
  it('accepts only supported loading units', () => {
    expect(normalizeGuidedLoadingUnit('boxes')).toBe('boxes');
    expect(normalizeGuidedLoadingUnit('pallets')).toBe('pallets');
    expect(normalizeGuidedLoadingUnit('box')).toBeNull();
    expect(normalizeGuidedLoadingUnit('')).toBeNull();
    expect(normalizeGuidedLoadingUnit(undefined)).toBeNull();
  });

  it('provides operator-facing labels', () => {
    expect(guidedLoadingUnitLabel('boxes')).toBe('박스 직접 적재');
    expect(guidedLoadingUnitLabel('pallets')).toBe('파렛트 적재');
    expect(guidedLoadingUnitLabel(null)).toBe('적재 유형 미선택');
  });
});
