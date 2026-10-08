import { describe, expect, it } from 'vitest';
import { CARTON_MATERIAL_ORDER, CARTON_MATERIALS, CARTON_STACKING_SAFETY_FACTOR, estimateCartonTopLoad } from './cartonMaterial';

describe('carton material strength estimate', () => {
  it('follows the simplified McKee formula with the safety factor', () => {
    // B골 단면 235 × 310 mm: perimeter 1.09 m, thickness 2.6 mm, ECT 29 lb/in.
    const estimate = estimateCartonTopLoad('b-flute', .235, .31)!;
    const expectedBctKg = 5.87 * 29 * 175.1268 * Math.sqrt(.0026 * 1.09) / 9.80665;
    expect(estimate.bctKg).toBeCloseTo(expectedBctKg, 6);
    expect(estimate.safetyFactor).toBe(CARTON_STACKING_SAFETY_FACTOR);
    expect(estimate.allowableTopLoadKg).toBe(Math.floor(expectedBctKg / 5 * 10) / 10);
    expect(estimate.allowableTopLoadKg).toBeGreaterThan(25);
    expect(estimate.allowableTopLoadKg).toBeLessThan(40);
  });

  it('ranks the corrugated grades from weakest to strongest for the same box', () => {
    const values = CARTON_MATERIAL_ORDER.map(m => estimateCartonTopLoad(m, .4, .3)?.allowableTopLoadKg).filter((v): v is number => v != null);
    expect(values).toHaveLength(4);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('grows with box size and never rounds up', () => {
    const small = estimateCartonTopLoad('ac-flute', .3, .2)!;
    const large = estimateCartonTopLoad('ac-flute', .6, .4)!;
    expect(large.allowableTopLoadKg).toBeGreaterThan(small.allowableTopLoadKg);
    expect(small.allowableTopLoadKg).toBeLessThanOrEqual(small.bctKg / small.safetyFactor);
  });

  it('gives no estimate for plastic, wood, no material or invalid input', () => {
    expect(estimateCartonTopLoad('plastic', .4, .3)).toBeNull();
    expect(estimateCartonTopLoad('wood', .4, .3)).toBeNull();
    expect(estimateCartonTopLoad(undefined, .4, .3)).toBeNull();
    expect(estimateCartonTopLoad('b-flute', 0, .3)).toBeNull();
    expect(estimateCartonTopLoad('b-flute', .4, .3, 0.5)).toBeNull();
    expect(CARTON_MATERIALS.plastic.ectLbPerIn).toBeUndefined();
  });
});
