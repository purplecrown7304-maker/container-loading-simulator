import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = { id: 'CACHE-1', name: '캐시 제품', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.5, quantity: 100 };
const boxes: BoxCatalogItem[] = [{
  id: 'CACHE-BOX', name: '캐시 박스', innerLength: 0.42, innerWidth: 0.32, innerHeight: 0.2,
  outerLength: 0.44, outerWidth: 0.34, outerHeight: 0.22, tareWeightKg: 0.4, maxGrossWeightKg: 20, maxTopLoadKg: 100,
}];

describe('packaging candidate cache', () => {
  it('returns the cached candidate array for identical inputs', () => {
    const state = { container, products: [product], boxes };
    const first = packagingCandidates(container, product, boxes, state);
    const second = packagingCandidates(container, product, boxes, state);
    expect(second).toBe(first);
  });
});
