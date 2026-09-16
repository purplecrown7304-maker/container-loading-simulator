import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = { id: 'OWNED-FIRST', name: '보유박스 우선 제품', length: 0.19, width: 0.1, height: 0.08, weightKg: 0.45, quantity: 90 };
const owned: BoxCatalogItem = {
  id: 'OWNED-FIRST-BOX', name: '보유 박스', innerLength: 0.4, innerWidth: 0.3, innerHeight: 0.18,
  outerLength: 0.42, outerWidth: 0.32, outerHeight: 0.2, tareWeightKg: 0.35, maxGrossWeightKg: 18, maxTopLoadKg: 80,
};

describe('owned carton priority', () => {
  it('does not mix generated cartons into the shortlist when an owned carton fits', () => {
    const candidates = packagingCandidates(container, product, [owned], {
      container,
      products: [product],
      boxes: [owned],
      settings: { allowCustom: true },
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => candidate.source === 'catalog')).toBe(true);
  });
});
