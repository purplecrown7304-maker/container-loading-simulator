import { describe, expect, it } from 'vitest';
import { optimizeProductPackaging, type BoxCatalogItem, type ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };

const lowBox: BoxCatalogItem = {
  id: 'LOW', name: '낮은 박스',
  innerLength: 0.42, innerWidth: 0.32, innerHeight: 0.12,
  outerLength: 0.43, outerWidth: 0.33, outerHeight: 0.13,
  tareWeightKg: 0.4, maxGrossWeightKg: 20, maxTopLoadKg: 80, unitCost: 1.25,
};

describe('enterprise product packaging constraints', () => {
  it('keeps upright-only products from being laid on their side', () => {
    const upright: ProductItem = {
      id: 'UP', name: '세워서 운송', length: 0.1, width: 0.1, height: 0.3,
      weightKg: 0.5, quantity: 10, orientationPolicy: 'upright',
    };
    const any: ProductItem = { ...upright, id: 'ANY', name: '회전 가능', orientationPolicy: 'any' };

    const uprightPlan = optimizeProductPackaging(container, [upright], [lowBox], { allowCustomBoxDesign: false, maxGeneratedGrossWeightKg: 22, generatedBoxTareKg: 0.6, clearanceM: 0.01, wallThicknessM: 0.004, maxGeneratedUnitsPerBox: 24 });
    const anyPlan = optimizeProductPackaging(container, [any], [lowBox], { allowCustomBoxDesign: false, maxGeneratedGrossWeightKg: 22, generatedBoxTareKg: 0.6, clearanceM: 0.01, wallThicknessM: 0.004, maxGeneratedUnitsPerBox: 24 });

    expect(uprightPlan.assignments).toHaveLength(0);
    expect(uprightPlan.rejected[0]?.productId).toBe('UP');
    expect(anyPlan.assignments).toHaveLength(1);
    expect(anyPlan.assignments[0].boxUnitCost).toBe(1.25);
  });

  it('uses cushioning clearance when calculating units per carton', () => {
    const box: BoxCatalogItem = {
      id: 'BOX', name: '박스',
      innerLength: 0.4, innerWidth: 0.2, innerHeight: 0.2,
      outerLength: 0.41, outerWidth: 0.21, outerHeight: 0.21,
      tareWeightKg: 0.3, maxGrossWeightKg: 20,
    };
    const base: ProductItem = { id: 'A', name: 'A', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.2, quantity: 100, orientationPolicy: 'upright' };
    const padded: ProductItem = { ...base, id: 'B', name: 'B', cushioningM: 0.01 };

    const basePlan = optimizeProductPackaging(container, [base], [box], { allowCustomBoxDesign: false, maxGeneratedGrossWeightKg: 22, generatedBoxTareKg: 0.6, clearanceM: 0.01, wallThicknessM: 0.004, maxGeneratedUnitsPerBox: 24 });
    const paddedPlan = optimizeProductPackaging(container, [padded], [box], { allowCustomBoxDesign: false, maxGeneratedGrossWeightKg: 22, generatedBoxTareKg: 0.6, clearanceM: 0.01, wallThicknessM: 0.004, maxGeneratedUnitsPerBox: 24 });

    expect(basePlan.assignments[0].unitsPerBox).toBeGreaterThan(paddedPlan.assignments[0].unitsPerBox);
  });

  it('limits fragile products to one internal layer unless explicitly overridden', () => {
    const tallBox: BoxCatalogItem = {
      id: 'TALL', name: '높은 박스',
      innerLength: 0.21, innerWidth: 0.21, innerHeight: 0.41,
      outerLength: 0.22, outerWidth: 0.22, outerHeight: 0.42,
      tareWeightKg: 0.3, maxGrossWeightKg: 20,
    };
    const normal: ProductItem = { id: 'N', name: '일반', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.2, quantity: 100, orientationPolicy: 'upright' };
    const fragile: ProductItem = { ...normal, id: 'F', name: '파손주의', fragile: true };
    const explicit: ProductItem = { ...fragile, id: 'E', name: '파손주의-2단허용', maxInternalLayers: 2 };

    const run = (product: ProductItem) => optimizeProductPackaging(container, [product], [tallBox], { allowCustomBoxDesign: false, maxGeneratedGrossWeightKg: 22, generatedBoxTareKg: 0.6, clearanceM: 0.01, wallThicknessM: 0.004, maxGeneratedUnitsPerBox: 24 }).assignments[0].unitsPerBox;
    expect(run(normal)).toBeGreaterThan(run(fragile));
    expect(run(explicit)).toBeGreaterThan(run(fragile));
  });
});
