import { describe, expect, it } from 'vitest';
import { packagingContentsModel, type PackagingInspection } from './packagingContentsModel';

function fixture(): PackagingInspection {
  return { product: { id: 'P', name: '제품', length: .1, width: .1, height: .1, quantity: 20, weightKg: 1 }, assignment: { productId: 'P', productName: '제품', boxId: 'B', boxName: '박스', source: 'catalog', unitsPerBox: 8, boxesNeeded: 3, innerLength: .201, innerWidth: .201, innerHeight: .201, outerLength: .211, outerWidth: .211, outerHeight: .211, grossWeightKg: 9, productFillRate: 1, containerTileEfficiency: 1, simulatedLoadedBoxes: 0, maxStackLayers: 3, recommendedStackLayers: 3, requiredTopLoadKg: 18, strengthStatus: 'catalog', score: 1 }, units: 8 };
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
    const m = packagingContentsModel(value)!; expect(m.positions[0][0]).toBeCloseTo(.1005); expect(m.positions[0][1]).toBeCloseTo(.1005); expect(m.positions[0][2]).toBeCloseTo(.1);
    value.units = 2; expect(packagingContentsModel(value)).toBeNull();
    value.product.cushioningM = 0; value.product.fragile = true; value.units = 5; expect(packagingContentsModel(value)).toBeNull();
    value.product.maxInternalLayers = 2; expect(packagingContentsModel(value)?.shown).toBe(5);
  });
  it('limits rendering while retaining the actual quantity and layers', () => {
    const value = fixture(); const m = packagingContentsModel(value, 3)!;
    expect(m.shown).toBe(3); expect(m.units).toBe(8); expect(m.layers).toBe(2);
  });
  it('uses exactly 1mm on all axes and preserves the wall cushion without changing inputs', () => {
    const value = fixture(); value.product.cushioningM = .005;
    value.assignment.innerLength = value.assignment.innerWidth = value.assignment.innerHeight = .22;
    value.assignment.outerLength = value.assignment.outerWidth = value.assignment.outerHeight = .23;
    const before = structuredClone(value);
    const m = packagingContentsModel(value)!;
    expect(m.shown).toBe(8); expect(m.layers).toBe(2); expect(m.padding).toBe(.005); expect(m.gap).toBe(.001);
    for (const [index, axis] of [[1, 0], [2, 1], [4, 2]]) {
      expect(m.positions[index][axis] - m.positions[0][axis] - m.size[axis]).toBeCloseTo(.001, 10);
    }
    for (const p of m.positions) p.forEach((v, i) => {
      expect(v - m.size[i] / 2).toBeGreaterThanOrEqual(m.padding - 1e-9);
      expect(v + m.size[i] / 2).toBeLessThanOrEqual(m.inner[i] - m.padding + 1e-9);
    });
    expect(value).toEqual(before);
  });
  it('does not fabricate room for 1mm gaps in an exact-fit carton', () => {
    const value = fixture(); value.assignment.innerLength = value.assignment.innerWidth = value.assignment.innerHeight = .2;
    expect(packagingContentsModel(value)).toBeNull();
    value.product.productGapM = 0;
    expect(packagingContentsModel(value)?.shown).toBe(8);
  });
  it('shows the recalculated 165-product carton in eleven layers', () => {
    // Synthetic reconstruction of the screenshot dimensions, not company inventory.
    const value = fixture();
    Object.assign(value.product, { length: .03, width: .04, height: .02, cushioningM: .005, quantity: 330 });
    Object.assign(value.assignment, { unitsPerBox: 165, innerLength: .227, innerWidth: .122, innerHeight: .257, outerLength: .235, outerWidth: .130, outerHeight: .265 });
    value.units = 165;
    const m = packagingContentsModel(value)!;
    expect(m.shown).toBe(165); expect(m.layers).toBe(11); expect(m.size).toEqual([.04, .03, .02]);
    expect(m.positions[15][2] - m.positions[0][2] - m.size[2]).toBeCloseTo(.001, 10);
    expect(m.positions[164][2] + m.size[2] / 2).toBeCloseTo(.235, 10);
  });
  it.each([-1, NaN, Infinity])('rejects an invalid display gap %s', gap => {
    const value = fixture(); value.product.productGapM = gap;
    expect(packagingContentsModel(value)).toBeNull();
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
