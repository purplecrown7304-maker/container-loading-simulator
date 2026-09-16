import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const box: BoxCatalogItem = {
  id: 'QTY-BOX', name: '수량 박스', innerLength: 0.42, innerWidth: 0.32, innerHeight: 0.2,
  outerLength: 0.44, outerWidth: 0.34, outerHeight: 0.22, tareWeightKg: 0.4, maxGrossWeightKg: 20, maxTopLoadKg: 100,
};
const base: CompanyProductItem = { id: 'QTY', name: '수량 변경', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.5, quantity: 10 };

describe('packaging cache invalidation', () => {
  it('uses quantity in the cache key', () => {
    const low = packagingCandidates(container, base, [box], { container, products: [base], boxes: [box] });
    const highProduct = { ...base, quantity: 100 };
    const high = packagingCandidates(container, highProduct, [box], { container, products: [highProduct], boxes: [box] });
    expect(high[0].boxesNeeded).toBeGreaterThan(low[0].boxesNeeded);
  });
});
