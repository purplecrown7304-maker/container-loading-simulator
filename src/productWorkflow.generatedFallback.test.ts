import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const product: CompanyProductItem = {
  id: 'AUTO-FALLBACK', name: '자동설계 테스트', length: 0.21, width: 0.11, height: 0.08,
  weightKg: 0.5, quantity: 40, requiresBoxPackaging: true,
};

describe('generated carton fallback', () => {
  it('still creates a generated candidate when there is no owned carton', () => {
    const candidates = packagingCandidates(container, product, [], {
      container,
      products: [product],
      boxes: [],
      settings: { allowCustom: true },
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].source).toBe('generated');
  });
});
