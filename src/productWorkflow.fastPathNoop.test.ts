import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };

describe('direct loading products', () => {
  it('skip packaging candidate work', () => {
    const product: CompanyProductItem = {
      id: 'DIRECT-ONLY', name: '직접 적재 제품', length: 0.4, width: 0.3, height: 0.2,
      weightKg: 5, quantity: 10, requiresBoxPackaging: false,
    };
    expect(packagingCandidates(container, product, [])).toEqual([]);
  });
});
