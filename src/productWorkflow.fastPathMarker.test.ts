import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = { id: 'FAST-MARKER', name: '빠른 후보', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.5, quantity: 30 };
const box: BoxCatalogItem = {
  id: 'FAST-BOX', name: '빠른 보유 박스', innerLength: 0.42, innerWidth: 0.32, innerHeight: 0.2,
  outerLength: 0.44, outerWidth: 0.34, outerHeight: 0.22, tareWeightKg: 0.4, maxGrossWeightKg: 20, maxTopLoadKg: 100,
};

describe('fast packaging metadata', () => {
  it('marks preselection candidates as not container-simulated', () => {
    const [candidate] = packagingCandidates(container, product, [box], { container, products: [product], boxes: [box] });
    expect(candidate.simulatedLoadedBoxes).toBe(0);
  });
});
