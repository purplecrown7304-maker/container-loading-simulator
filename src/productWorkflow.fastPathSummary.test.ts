import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = { id: 'SHORTLIST', name: '후보 제한', length: 0.1, width: 0.08, height: 0.06, weightKg: 0.3, quantity: 100 };
const boxes: BoxCatalogItem[] = Array.from({ length: 8 }, (_, index) => ({
  id: `S-${index}`,
  name: `박스 ${index}`,
  innerLength: 0.3 + index * 0.01,
  innerWidth: 0.25,
  innerHeight: 0.2,
  outerLength: 0.32 + index * 0.01,
  outerWidth: 0.27,
  outerHeight: 0.22,
  tareWeightKg: 0.4,
  maxGrossWeightKg: 20,
  maxTopLoadKg: 100,
}));

describe('packaging shortlist', () => {
  it('keeps at most three candidates for a product', () => {
    const candidates = packagingCandidates(container, product, boxes, { container, products: [product], boxes });
    expect(candidates.length).toBeLessThanOrEqual(3);
  });
});
