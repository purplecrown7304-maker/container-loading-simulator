import { describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { packagingCandidates } from './productWorkflow';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };

const boxes: BoxCatalogItem[] = Array.from({ length: 24 }, (_, index) => ({
  id: `BOX-${index + 1}`,
  name: `보유 박스 ${index + 1}`,
  innerLength: 0.3 + (index % 4) * 0.05,
  innerWidth: 0.25 + (index % 3) * 0.04,
  innerHeight: 0.18 + (index % 2) * 0.04,
  outerLength: 0.32 + (index % 4) * 0.05,
  outerWidth: 0.27 + (index % 3) * 0.04,
  outerHeight: 0.2 + (index % 2) * 0.04,
  tareWeightKg: 0.4,
  maxGrossWeightKg: 22,
  maxTopLoadKg: 100,
}));

const products: CompanyProductItem[] = Array.from({ length: 120 }, (_, index) => ({
  id: `PRD-${index + 1}`,
  name: `제품 ${index + 1}`,
  length: 0.12 + (index % 3) * 0.01,
  width: 0.08 + (index % 2) * 0.01,
  height: 0.06,
  weightKg: 0.35 + (index % 4) * 0.05,
  quantity: 50 + index,
  requiresBoxPackaging: true,
}));

describe('packaging transition throughput guard', () => {
  it('prepares many products with bounded fast candidate work', () => {
    const started = performance.now();
    const result = products.map(product => packagingCandidates(container, product, boxes, {
      container,
      products,
      boxes,
    }));
    const elapsed = performance.now() - started;

    expect(result.every(candidates => candidates.length > 0 && candidates.length <= 3)).toBe(true);
    // 넉넉한 상한이다. 회귀로 loadContainer 시뮬레이션이 다시 들어오면 이 테스트가 크게 느려진다.
    expect(elapsed).toBeLessThan(1500);
  });
});
