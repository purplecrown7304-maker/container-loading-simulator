import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem, ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { cargoFromProductPackaging, packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000 };
const product: CompanyProductItem = {
  id: 'P-1', name: '제품 1', length: .2, width: .1, height: .1,
  weightKg: 2, quantity: 5, requiresBoxPackaging: true,
};
const snug: BoxCatalogItem = {
  id: 'OWN-SNUG', name: '보유 소형', innerLength: .42, innerWidth: .22, innerHeight: .12,
  outerLength: .44, outerWidth: .24, outerHeight: .14,
  tareWeightKg: 1, maxGrossWeightKg: 30, maxTopLoadKg: 80,
};
const large: BoxCatalogItem = {
  id: 'OWN-LARGE', name: '보유 대형', innerLength: .8, innerWidth: .6, innerHeight: .5,
  outerLength: .82, outerWidth: .62, outerHeight: .52,
  tareWeightKg: 1.5, maxGrossWeightKg: 40, maxTopLoadKg: 100,
};

describe('product packaging priority', () => {
  it('returns only registered boxes when an owned/catalog box can safely fit the product', () => {
    const result = packagingCandidates(container, product, [large, snug], {
      container, products: [product], boxes: [large, snug], settings: { allowCustom: true },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(item => item.source === 'catalog')).toBe(true);
    expect(result.some(item => item.boxId.startsWith('AUTO-'))).toBe(false);
  });

  it('ranks the owned box with less internal waste first', () => {
    const result = packagingCandidates(container, product, [large, snug], {
      container, products: [product], boxes: [large, snug], settings: { allowCustom: true },
    });
    expect(result[0]?.productFillRate).toBeGreaterThanOrEqual(result[1]?.productFillRate ?? 0);
  });
});

describe('packed cargo weight', () => {
  it('includes carton tare for both full and partial cartons', () => {
    const assignment: ProductPackagingAssignment = {
      productId: product.id,
      productName: product.name,
      boxId: snug.id,
      boxName: snug.name,
      source: 'catalog',
      unitsPerBox: 4,
      boxesNeeded: 2,
      outerLength: snug.outerLength,
      outerWidth: snug.outerWidth,
      outerHeight: snug.outerHeight,
      innerLength: snug.innerLength,
      innerWidth: snug.innerWidth,
      innerHeight: snug.innerHeight,
      grossWeightKg: 9,
      productFillRate: .8,
      containerTileEfficiency: .8,
      simulatedLoadedBoxes: 2,
      maxStackLayers: 2,
      recommendedStackLayers: 2,
      maxTopLoadKg: 80,
      requiredTopLoadKg: 9,
      strengthStatus: 'catalog',
      score: .9,
    };
    const cargo = cargoFromProductPackaging([product], [assignment]);
    const full = cargo.find(item => item.id === 'PKG-P-1');
    const partial = cargo.find(item => item.id === 'PKG-P-1-PARTIAL');
    expect(full?.weightKg).toBe(9); // 제품 4EA 8kg + 박스 자중 1kg
    expect(partial?.weightKg).toBe(3); // 제품 1EA 2kg + 박스 자중 1kg
    expect(full?.boxId).toBe('OWN-SNUG');
    expect(partial?.boxName).toBe('보유 소형');
  });
});
