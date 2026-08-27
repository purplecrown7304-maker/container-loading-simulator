import { describe, expect, it } from 'vitest';
import { defaultProductPackagingOptions, type BoxCatalogItem, type ProductItem } from './productPackagingOptimizer';
import { optimizeCommonCartonFamily } from './commonCartonFamilyOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const products: ProductItem[] = [
  { id: 'A', name: 'A', length: 0.18, width: 0.1, height: 0.08, weightKg: 0.4, quantity: 120, maxUnitsPerBox: 12 },
  { id: 'B', name: 'B', length: 0.2, width: 0.11, height: 0.09, weightKg: 0.5, quantity: 120, maxUnitsPerBox: 12 },
  { id: 'C', name: 'C', length: 0.22, width: 0.12, height: 0.1, weightKg: 0.6, quantity: 120, maxUnitsPerBox: 12 },
];

const boxes: BoxCatalogItem[] = [
  { id: 'BOX-A', name: 'A 전용', innerLength: 0.37, innerWidth: 0.21, innerHeight: 0.17, outerLength: 0.38, outerWidth: 0.22, outerHeight: 0.18, tareWeightKg: 0.4, maxGrossWeightKg: 16, maxTopLoadKg: 60 },
  { id: 'BOX-B', name: 'B 전용', innerLength: 0.41, innerWidth: 0.23, innerHeight: 0.19, outerLength: 0.42, outerWidth: 0.24, outerHeight: 0.2, tareWeightKg: 0.45, maxGrossWeightKg: 18, maxTopLoadKg: 70 },
  { id: 'BOX-C', name: 'C 전용', innerLength: 0.45, innerWidth: 0.25, innerHeight: 0.21, outerLength: 0.46, outerWidth: 0.26, outerHeight: 0.22, tareWeightKg: 0.5, maxGrossWeightKg: 20, maxTopLoadKg: 80 },
  { id: 'BOX-COMMON', name: '공용', innerLength: 0.47, innerWidth: 0.27, innerHeight: 0.23, outerLength: 0.48, outerWidth: 0.28, outerHeight: 0.24, tareWeightKg: 0.55, maxGrossWeightKg: 20, maxTopLoadKg: 80 },
];

describe('optimizeCommonCartonFamily', () => {
  it('can consolidate products into a smaller deterministic carton family', () => {
    const first = optimizeCommonCartonFamily(container, products, boxes, {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    }, {
      enabled: true,
      targetMaxBoxTypes: 1,
      maxAssignmentScoreLoss: 0.5,
      dimensionRoundingM: 0.01,
      preferCatalog: true,
    });
    const second = optimizeCommonCartonFamily(container, [...products].reverse(), [...boxes].reverse(), {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    }, {
      enabled: true,
      targetMaxBoxTypes: 1,
      maxAssignmentScoreLoss: 0.5,
      dimensionRoundingM: 0.01,
      preferCatalog: true,
    });

    expect(first.assignments).toHaveLength(3);
    expect(first.family.selectedBoxTypes).toBeLessThanOrEqual(first.family.baselineBoxTypes);
    expect(first.family.selectedBoxTypes).toBe(1);
    expect(first.family.targetExceeded).toBe(false);
    expect(new Set(first.assignments.map((item) => item.boxId)).size).toBe(1);
    expect(first.family.selectedBoxes).toHaveLength(1);
    expect(first.family.selectedBoxes[0].assignedProducts).toEqual(['A', 'B', 'C']);
    expect(first.cargo.reduce((sum, item) => sum + item.quantity, 0)).toBe(first.totalBoxes);

    const signature = (plan: typeof first) => [...plan.assignments]
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => `${item.productId}:${item.boxId}:${item.unitsPerBox}:${item.boxesNeeded}`);
    expect(signature(first)).toEqual(signature(second));
  });

  it('counts duplicate catalog codes with identical dimensions as one physical carton specification', () => {
    const sameA: BoxCatalogItem = {
      id: 'SAME-A', name: '같은규격 A', innerLength: 0.49, innerWidth: 0.29, innerHeight: 0.29,
      outerLength: 0.5, outerWidth: 0.3, outerHeight: 0.3, tareWeightKg: 0.6, maxGrossWeightKg: 20, maxTopLoadKg: 80,
    };
    const sameB: BoxCatalogItem = { ...sameA, id: 'SAME-B', name: '같은규격 B' };
    const compatibleProducts: ProductItem[] = [
      { id: 'P1', name: 'P1', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.4, quantity: 30, maxUnitsPerBox: 6 },
      { id: 'P2', name: 'P2', length: 0.19, width: 0.1, height: 0.08, weightKg: 0.4, quantity: 30, maxUnitsPerBox: 6 },
    ];
    const plan = optimizeCommonCartonFamily(container, compatibleProducts, [sameA, sameB], {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    }, {
      enabled: false,
      targetMaxBoxTypes: 1,
      maxAssignmentScoreLoss: 0,
      dimensionRoundingM: 0.01,
      preferCatalog: true,
    });

    expect(plan.assignments).toHaveLength(2);
    expect(plan.family.baselineBoxTypes).toBe(1);
    expect(plan.family.selectedBoxTypes).toBe(1);
    expect(plan.family.selectedBoxes).toHaveLength(1);
    expect(plan.family.selectedBoxes[0].assignedProducts).toEqual(['P1', 'P2']);
  });

  it('exceeds the target instead of forcing an unsafe or poor-fit carton', () => {
    const plan = optimizeCommonCartonFamily(container, products.slice(0, 2), boxes.slice(0, 2), {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    }, {
      enabled: true,
      targetMaxBoxTypes: 1,
      maxAssignmentScoreLoss: 0,
      dimensionRoundingM: 0.01,
      preferCatalog: true,
    });

    expect(plan.assignments).toHaveLength(2);
    expect(plan.family.selectedBoxTypes).toBeGreaterThanOrEqual(1);
    expect(plan.rejected).toHaveLength(0);
  });
});
