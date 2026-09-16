import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = { id: 'BOX-CHANGE', name: '박스 변경', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.5, quantity: 50 };
const box = (id: string, innerLength: number): BoxCatalogItem => ({
  id, name: id, innerLength, innerWidth: 0.32, innerHeight: 0.2,
  outerLength: innerLength + 0.02, outerWidth: 0.34, outerHeight: 0.22,
  tareWeightKg: 0.4, maxGrossWeightKg: 20, maxTopLoadKg: 100,
});

describe('box catalog cache key', () => {
  it('does not reuse candidates from a different catalog array', () => {
    const firstBoxes = [box('BOX-A', 0.42)];
    const secondBoxes = [box('BOX-B', 0.52)];
    const first = packagingCandidates(container, product, firstBoxes, { container, products: [product], boxes: firstBoxes });
    const second = packagingCandidates(container, product, secondBoxes, { container, products: [product], boxes: secondBoxes });
    expect(first[0].boxId).toBe('BOX-A');
    expect(second[0].boxId).toBe('BOX-B');
  });
});
