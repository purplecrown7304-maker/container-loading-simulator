import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = {
  length: 5.9,
  width: 2.352,
  height: 2.395,
  maxPayloadKg: 28130,
};

const product: CompanyProductItem = {
  id: 'PERF-001',
  name: '성능 테스트 제품',
  length: 0.2,
  width: 0.1,
  height: 0.08,
  weightKg: 0.5,
  quantity: 240,
  maxUnitsPerBox: 6,
  requiresBoxPackaging: true,
};

const ownedBox: BoxCatalogItem = {
  id: 'OWNED-001',
  name: '보유 박스',
  innerLength: 0.43,
  innerWidth: 0.32,
  innerHeight: 0.18,
  outerLength: 0.45,
  outerWidth: 0.34,
  outerHeight: 0.2,
  tareWeightKg: 0.4,
  maxGrossWeightKg: 20,
  maxTopLoadKg: 80,
};

describe('packagingCandidates fast path', () => {
  it('uses fitting owned boxes before generating a new box', () => {
    const candidates = packagingCandidates(container, product, [ownedBox], {
      container,
      products: [product],
      boxes: [ownedBox],
      settings: { allowCustom: true },
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => candidate.source === 'catalog')).toBe(true);
    expect(candidates[0].boxId).toBe('OWNED-001');
  });

  it('respects the product max-units-per-box limit without running a container simulation', () => {
    const candidates = packagingCandidates(container, product, [ownedBox], {
      container,
      products: [product],
      boxes: [ownedBox],
    });

    expect(candidates[0].unitsPerBox).toBeLessThanOrEqual(6);
    expect(candidates[0].simulatedLoadedBoxes).toBe(0);
  });

  it('falls back to a generated box only when no owned box fits', () => {
    const tinyBox: BoxCatalogItem = {
      ...ownedBox,
      id: 'TINY',
      name: '너무 작은 박스',
      innerLength: 0.05,
      innerWidth: 0.05,
      innerHeight: 0.05,
      outerLength: 0.07,
      outerWidth: 0.07,
      outerHeight: 0.07,
    };
    const candidates = packagingCandidates(container, product, [tinyBox], {
      container,
      products: [product],
      boxes: [tinyBox],
      settings: { allowCustom: true },
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].source).toBe('generated');
  });
});
