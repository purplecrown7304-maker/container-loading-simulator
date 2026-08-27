import { describe, expect, it } from 'vitest';
import { defaultProductPackagingOptions, optimizeProductPackaging, type BoxCatalogItem, type ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const product: ProductItem = {
  id: 'P-01',
  name: '제품A',
  length: 0.2,
  width: 0.1,
  height: 0.05,
  weightKg: 0.5,
  quantity: 240,
  maxUnitsPerBox: 24,
};

const catalog: BoxCatalogItem[] = [{
  id: 'BOX-01',
  name: '기존 400박스',
  innerLength: 0.4,
  innerWidth: 0.3,
  innerHeight: 0.2,
  outerLength: 0.41,
  outerWidth: 0.31,
  outerHeight: 0.21,
  tareWeightKg: 0.5,
  maxGrossWeightKg: 20,
  maxTopLoadKg: 80,
}];

describe('product packaging optimizer', () => {
  it('selects a usable verified catalog carton and converts products into container cargo', () => {
    const plan = optimizeProductPackaging(container, [product], catalog, {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    });
    expect(plan.rejected).toEqual([]);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].source).toBe('catalog');
    expect(plan.assignments[0].strengthStatus).toBe('catalog');
    expect(plan.assignments[0].unitsPerBox).toBeGreaterThan(0);
    expect(plan.assignments[0].boxesNeeded).toBeGreaterThan(0);
    expect(plan.cargo[0].quantity).toBe(plan.assignments[0].boxesNeeded);
    expect(plan.cargo[0].id).toBe('PKG-P-01');
  });

  it('can design a new carton but keeps it at one layer until physical strength is verified', () => {
    const tinyCatalog: BoxCatalogItem[] = [{
      id: 'TINY', name: '너무 작은 박스',
      innerLength: 0.1, innerWidth: 0.08, innerHeight: 0.04,
      outerLength: 0.11, outerWidth: 0.09, outerHeight: 0.05,
      tareWeightKg: 0.2, maxGrossWeightKg: 10, maxTopLoadKg: 20,
    }];
    const plan = optimizeProductPackaging(container, [product], tinyCatalog);
    expect(plan.rejected).toEqual([]);
    expect(plan.assignments[0].source).toBe('generated');
    expect(plan.assignments[0].simulatedLoadedBoxes).toBeGreaterThan(0);
    expect(plan.assignments[0].requiredTopLoadKg).toBeGreaterThanOrEqual(0);
    expect(plan.assignments[0].strengthStatus).toBe('design-target');
    expect(plan.assignments[0].recommendedStackLayers).toBeGreaterThanOrEqual(1);
    expect(plan.assignments[0].maxStackLayers).toBe(1);
    expect(plan.assignments[0].maxTopLoadKg).toBe(0);
    expect(plan.cargo[0].maxStackLayers).toBe(1);
    expect(plan.cargo[0].maxTopLoadKg).toBe(0);
  });

  it('rounds generated inner and outer dimensions upward to the manufacturing grid', () => {
    const awkward: ProductItem = {
      ...product,
      id: 'ODD',
      length: 0.203,
      width: 0.117,
      height: 0.061,
      quantity: 20,
      maxUnitsPerBox: 4,
      cushioningM: 0.003,
    };
    const plan = optimizeProductPackaging(container, [awkward], [], {
      ...defaultProductPackagingOptions,
      generatedDimensionStepM: 0.005,
    });
    const assignment = plan.assignments[0];
    expect(assignment.source).toBe('generated');
    for (const size of [assignment.innerLength, assignment.innerWidth, assignment.innerHeight, assignment.outerLength, assignment.outerWidth, assignment.outerHeight]) {
      expect(Math.round(size * 1000) % 5).toBe(0);
    }
    expect(assignment.innerLength * assignment.innerWidth * assignment.innerHeight).toBeGreaterThan(0);
  });

  it('rejects invalid products instead of sending them to the loading engine', () => {
    const plan = optimizeProductPackaging(container, [{ ...product, quantity: 1.5 }], catalog);
    expect(plan.assignments).toEqual([]);
    expect(plan.cargo).toEqual([]);
    expect(plan.rejected[0].reason).toContain('정수');
  });
});
