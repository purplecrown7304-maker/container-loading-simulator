import { describe, expect, it } from 'vitest';
import { packagingContentsModel, type PackagingInspection } from './packagingContentsModel';

function fixture(): PackagingInspection {
  return { product: { id: 'P', name: '제품', length: .1, width: .1, height: .1, quantity: 20, weightKg: 1 }, assignment: { productId: 'P', productName: '제품', boxId: 'B', boxName: '박스', source: 'catalog', unitsPerBox: 8, boxesNeeded: 3, innerLength: .2, innerWidth: .2, innerHeight: .2, outerLength: .21, outerWidth: .21, outerHeight: .21, grossWeightKg: 9, productFillRate: 1, containerTileEfficiency: 1, simulatedLoadedBoxes: 0, maxStackLayers: 3, recommendedStackLayers: 3, requiredTopLoadKg: 18, strengthStatus: 'catalog', score: 1 }, units: 8 };
}
describe('carton contents display geometry', () => {
  it('uses the full count, real sizes and non-overlapping positions inside the inner walls', () => {
    const m = packagingContentsModel(fixture())!;
    expect(m.positions).toHaveLength(8); expect(m.layers).toBe(2); expect(m.size).toEqual([.1, .1, .1]);
    for (const p of m.positions) p.forEach((v, i) => { expect(v - m.size[i] / 2).toBeGreaterThanOrEqual(-1e-9); expect(v + m.size[i] / 2).toBeLessThanOrEqual(m.inner[i] + 1e-9); });
    for (let a = 0; a < m.shown; a++) for (let b = a + 1; b < m.shown; b++) expect(m.positions[a].some((v, i) => Math.abs(v - m.positions[b][i]) >= m.size[i] - 1e-9)).toBe(true);
  });
  it('shows the actual remainder instead of filling a partial carton', () => {
    const value = fixture(); value.units = 3;
    const m = packagingContentsModel(value)!; expect(m.units).toBe(3); expect(m.shown).toBe(3); expect(m.layers).toBe(1);
  });
  it('respects base rotation and refuses to shrink an upright product', () => {
    const value = fixture(); value.product.length = .3; value.product.width = .2; value.assignment.innerWidth = .3; value.assignment.outerWidth = .31; value.units = 2;
    expect(packagingContentsModel(value)?.size).toEqual([.2, .3, .1]);
    value.product.allowRotation = false; expect(packagingContentsModel(value)).toBeNull();
  });
  it('permits vertical rotation only under any orientation policy', () => {
    const value = fixture(); value.product.height = .3; value.assignment.innerLength = .3; value.assignment.outerLength = .31; value.assignment.innerHeight = .1; value.units = 2;
    expect(packagingContentsModel(value)).toBeNull(); value.product.orientationPolicy = 'any'; expect(packagingContentsModel(value)?.shown).toBe(2);
  });
  it('preserves cushioning space and declared internal layers', () => {
    const value = fixture(); value.product.cushioningM = .05; value.units = 1;
    const m = packagingContentsModel(value)!; expect(m.positions[0]).toEqual([.1, .1, .1]);
    value.units = 2; expect(packagingContentsModel(value)).toBeNull();
    value.product.cushioningM = 0; value.product.fragile = true; value.units = 5; expect(packagingContentsModel(value)).toBeNull();
    value.product.maxInternalLayers = 2; expect(packagingContentsModel(value)?.shown).toBe(5);
  });
  it('limits rendering while retaining the actual quantity and layers', () => {
    const value = fixture(); const m = packagingContentsModel(value, 3)!;
    expect(m.shown).toBe(3); expect(m.units).toBe(8); expect(m.layers).toBe(2);
  });
  it.each([0, NaN, Infinity, -1])('rejects invalid dimensions %s rather than inventing products', dimension => {
    const value = fixture(); value.product.length = dimension; expect(packagingContentsModel(value)).toBeNull();
  });
  it('rejects impossible outer walls and mismatched quantities', () => {
    const value = fixture(); value.assignment.outerLength = .1; expect(packagingContentsModel(value)).toBeNull();
    value.assignment.outerLength = .21; value.units = 9; expect(packagingContentsModel(value)).toBeNull();
    value.units = 8; value.product.quantity = 3; expect(packagingContentsModel(value)).toBeNull();
  });
});
