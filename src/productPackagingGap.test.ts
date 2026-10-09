import { describe, expect, it } from 'vitest';
import { optimizeProductPackaging, defaultProductPackagingOptions, type BoxCatalogItem, type ProductItem } from './engine/productPackagingOptimizer';
import { productInteriorGrid, productPackingOrientations } from './engine/productInteriorGeometry';
import { cargoFromProductPackaging, packagingCandidates } from './productWorkflow';
import { packagingContentsModel } from './packagingContentsModel';
import { loadContainer } from './engine/loadingEngine';
import { buildShipmentInstructionSection, readShipmentInstructionSnapshot, writeShipmentInstructionSnapshot } from './shipmentInstruction';

const container = { length: 5.9, width: 2.35, height: 2.7, maxPayloadKg: 28130 };
const product: ProductItem = { id: 'GAP', name: '간격 검증', length: .03, width: .04, height: .02, cushioningM: .005, weightKg: .1, quantity: 330 };
const box: BoxCatalogItem = { id: 'GAP-BOX', name: '235×130×265', innerLength: .227, innerWidth: .122, innerHeight: .257, outerLength: .235, outerWidth: .130, outerHeight: .265, tareWeightKg: .1, maxGrossWeightKg: 22, maxTopLoadKg: 100, maxStackLayers: 10 };
const options = { ...defaultProductPackagingOptions, allowCustomBoxDesign: false };
const quick = (p: ProductItem, b = box) => packagingCandidates(container, p, [b], { container, products: [p], boxes: [b], settings: { allowCustom: false } })[0];

describe('shared product-to-product spacing', () => {
  it('increases reported capacity from 96 to 165 in both calculators and the real-size display', () => {
    const inner = [box.innerLength, box.innerWidth, box.innerHeight];
    // Historical rule: each product carried 5mm on both sides, a 10mm inter-product gap.
    const historical = Math.max(...productPackingOrientations(product).map(size => size.map((v, i) => Math.floor(inner[i] / (v + 2 * product.cushioningM!))).reduce((a, b) => a * b, 1)));
    expect(historical).toBe(96);
    const plan = optimizeProductPackaging(container, [product], [box], options);
    const assignment = plan.assignments[0];
    expect(assignment.unitsPerBox).toBe(165); expect(assignment.boxesNeeded).toBe(2);
    expect(plan.totalPackedProducts).toBe(330); expect(plan.rejected).toEqual([]);
    expect(quick(product).unitsPerBox).toBe(165);
    const model = packagingContentsModel({ product, assignment, units: 165 })!;
    expect(model.layers).toBe(11); expect(model.positions).toHaveLength(165);
    for (const p of model.positions) p.forEach((v, i) => {
      expect(v - model.size[i] / 2).toBeGreaterThanOrEqual(.005 - 1e-9);
      expect(v + model.size[i] / 2).toBeLessThanOrEqual(inner[i] - .005 + 1e-9);
    });
    for (let a = 0; a < model.shown; a++) for (let b = a + 1; b < model.shown; b++) {
      expect(model.positions[a].some((v, i) => Math.abs(v - model.positions[b][i]) >= model.size[i] + .001 - 1e-9)).toBe(true);
    }
    expect(optimizeProductPackaging(container, [product], [box], options)).toEqual(plan);
  });
  it.each([
    [{ ...product, weightKg: 1 }, 21],
    [{ ...product, maxUnitsPerBox: 50 }, 50],
    [{ ...product, fragile: true }, 15],
    [{ ...product, maxInternalLayers: 2 }, 30],
    [{ ...product, orientationPolicy: 'upright' as const }, 154],
  ])('retains weight, quantity, fragile, layer and orientation limits', (p, expected) => {
    expect(quick(p).unitsPerBox).toBe(expected);
    expect(optimizeProductPackaging(container, [p], [box], options).assignments[0].unitsPerBox).toBe(expected);
  });
  it('invalidates cached candidates when the configurable gap changes', () => {
    const small = quick(product); const large = quick({ ...product, productGapM: .010 });
    expect(small.unitsPerBox).toBe(165); expect(large.unitsPerBox).toBe(96); expect(large).not.toBe(small);
  });
  it.each([NaN, Infinity, -1])('rejects invalid gap %s even after valid candidates were cached', gap => {
    expect(quick(product).unitsPerBox).toBe(165);
    expect(packagingCandidates(container, { ...product, productGapM: gap }, [box], { container, products: [product], boxes: [box] })).toEqual([]);
    expect(optimizeProductPackaging(container, [{ ...product, productGapM: gap }], [box], options).assignments).toEqual([]);
  });
  it('rounds newly designed boxes outward and fits every counted product with the same grid', () => {
    const p = { ...product, quantity: 8, maxUnitsPerBox: 8 };
    const plan = optimizeProductPackaging(container, [p], [], { ...options, allowCustomBoxDesign: true });
    const a = plan.assignments[0];
    const capacity = Math.max(...productPackingOrientations(p).map(size => productInteriorGrid(p, [a.innerLength, a.innerWidth, a.innerHeight], size).reduce((x, y) => x * y, 1)));
    expect(a.unitsPerBox).toBeLessThanOrEqual(capacity);
    expect(packagingContentsModel({ product: p, assignment: a, units: Math.min(p.quantity, a.unitsPerBox) })).not.toBeNull();
    for (const dim of [a.innerLength, a.innerWidth, a.innerHeight, a.outerLength, a.outerWidth, a.outerHeight]) expect(Math.round(dim * 1000) % 5).toBe(0);
    expect(a.maxTopLoadKg).toBe(0); expect(a.maxStackLayers).toBe(1);
  });
  it('preserves all 168 products through full/remainder cargo and the work order', () => {
    const p = { ...product, quantity: 168 };
    const a = quick(p);
    const cargo = cargoFromProductPackaging([p], [a]);
    expect(cargo.map(item => [item.quantity, item.unitsPerPackage])).toEqual([[1, 165], [1, 3]]);
    expect(cargo.reduce((sum, item) => sum + item.quantity * item.unitsPerPackage!, 0)).toBe(168);
    expect(cargo.reduce((sum, item) => sum + item.quantity * item.weightKg, 0)).toBeCloseTo(17);
    expect(packagingContentsModel({ product: p, assignment: a, units: 3 })?.shown).toBe(3);
    writeShipmentInstructionSnapshot([p], [a], cargo);
    expect(readShipmentInstructionSnapshot(cargo)?.lines[0]).toMatchObject({ unitsPerBox: 165, boxesNeeded: 2, partialUnits: 3, productGapM: .001, wallCushioningM: .005 });
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.placements.length + result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(2);
    expect(result.placements).toHaveLength(2);
    const instruction = buildShipmentInstructionSection(cargo, result);
    expect(instruction).toContain('적재 환산 168 EA');
    expect(instruction).toContain('제품 간격 1 mm · 벽 완충 5 mm');
    window.localStorage.clear();
  });
});
