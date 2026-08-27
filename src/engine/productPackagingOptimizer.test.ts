import { describe, expect, it } from 'vitest';
import { bestBaseRotationLayerCapacity, defaultProductPackagingOptions, optimizeProductPackaging, type BoxCatalogItem, type ProductItem } from './productPackagingOptimizer';
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
  it('selects a usable carton and converts products into container cargo', () => {
    const plan = optimizeProductPackaging(container, [product], catalog, {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    });
    expect(plan.rejected).toEqual([]);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].source).toBe('catalog');
    expect(plan.assignments[0].unitsPerBox).toBeGreaterThan(0);
    expect(plan.assignments[0].boxesNeeded).toBeGreaterThan(0);
    expect(plan.cargo[0].quantity).toBe(plan.assignments[0].boxesNeeded);
    expect(plan.cargo[0].id).toBe('PKG-P-01');
  });

  it('uses a constructible mixed 90-degree layer pattern when it fits more units', () => {
    // 500×500 한 층에 300×200 제품은 한 방향 격자만 쓰면 2EA지만,
    // 200mm 폭 strip + 300mm 폭 strip으로 나눠 1EA + 회전 2EA = 3EA가 구성 가능하다.
    expect(bestBaseRotationLayerCapacity(0.5, 0.5, 0.3, 0.2)).toBe(3);
    const mixedBox: BoxCatalogItem = {
      id: 'MIX-ROT', name: '혼합회전 박스',
      innerLength: 0.5, innerWidth: 0.5, innerHeight: 0.1,
      outerLength: 0.51, outerWidth: 0.51, outerHeight: 0.11,
      tareWeightKg: 0.5, maxGrossWeightKg: 10, maxTopLoadKg: 30,
    };
    const mixedProduct: ProductItem = {
      id: 'ROT', name: '회전 혼합 제품', length: 0.3, width: 0.2, height: 0.1,
      weightKg: 1, quantity: 9, maxUnitsPerBox: 10, orientationPolicy: 'base-rotation', maxInternalLayers: 1,
    };
    const plan = optimizeProductPackaging(container, [mixedProduct], [mixedBox], {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    });
    expect(plan.rejected).toEqual([]);
    expect(plan.assignments[0].unitsPerBox).toBe(3);
    expect(plan.assignments[0].boxesNeeded).toBe(3);
  });

  it('does not use mixed base rotations when the product must stay upright without rotation', () => {
    const noRotateBox: BoxCatalogItem = {
      id: 'NO-ROT', name: '회전금지 박스',
      innerLength: 0.5, innerWidth: 0.5, innerHeight: 0.1,
      outerLength: 0.51, outerWidth: 0.51, outerHeight: 0.11,
      tareWeightKg: 0.5, maxGrossWeightKg: 10, maxTopLoadKg: 30,
    };
    const noRotateProduct: ProductItem = {
      id: 'UP', name: '방향고정', length: 0.3, width: 0.2, height: 0.1,
      weightKg: 1, quantity: 8, maxUnitsPerBox: 10, orientationPolicy: 'upright', maxInternalLayers: 1,
    };
    const plan = optimizeProductPackaging(container, [noRotateProduct], [noRotateBox], {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: false,
    });
    expect(plan.assignments[0].unitsPerBox).toBe(2);
  });

  it('can design a new carton when the registered catalog cannot fit the product', () => {
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
  });

  it('rejects invalid products instead of sending them to the loading engine', () => {
    const plan = optimizeProductPackaging(container, [{ ...product, quantity: 1.5 }], catalog);
    expect(plan.assignments).toEqual([]);
    expect(plan.cargo).toEqual([]);
    expect(plan.rejected[0].reason).toContain('정수');
  });
});
