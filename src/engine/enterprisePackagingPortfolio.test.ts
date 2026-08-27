import { describe, expect, it } from 'vitest';
import { defaultEnterprisePackagingOptions } from './enterprisePackagingOptimizer';
import { optimizeEnterprisePackagingPortfolio } from './enterprisePackagingPortfolio';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const products: ProductItem[] = [
  { id: 'A', name: 'A', length: 0.18, width: 0.1, height: 0.08, weightKg: 0.4, quantity: 101, maxUnitsPerBox: 10, allowMixedCarton: true },
  { id: 'B', name: 'B', length: 0.2, width: 0.11, height: 0.09, weightKg: 0.5, quantity: 101, maxUnitsPerBox: 10, allowMixedCarton: true },
  { id: 'C', name: 'C', length: 0.22, width: 0.12, height: 0.1, weightKg: 0.6, quantity: 101, maxUnitsPerBox: 10, allowMixedCarton: true },
];
const boxes: BoxCatalogItem[] = [
  { id: 'SMALL', name: 'Small', innerLength: 0.4, innerWidth: 0.25, innerHeight: 0.2, outerLength: 0.41, outerWidth: 0.26, outerHeight: 0.21, tareWeightKg: 0.4, maxGrossWeightKg: 16, maxTopLoadKg: 60, unitCost: 1 },
  { id: 'COMMON', name: 'Common', innerLength: 0.5, innerWidth: 0.3, innerHeight: 0.25, outerLength: 0.51, outerWidth: 0.31, outerHeight: 0.26, tareWeightKg: 0.5, maxGrossWeightKg: 20, maxTopLoadKg: 80, unitCost: 1.1 },
];

function baseOptions() {
  return {
    ...defaultEnterprisePackagingOptions,
    packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: false },
    family: { ...defaultEnterprisePackagingOptions.family, enabled: true, maxAssignmentScoreLoss: 0.5 },
    allowMixedResidualCartons: true,
    maxEstimatedContainers: 20,
    cost: {
      containerFreightCost: 1000,
      handlingCostPerCarton: 0.2,
      newBoxSetupCost: 0,
      cartonSkuCarryCost: 50,
      currency: 'KRW',
    },
  };
}

describe('optimizeEnterprisePackagingPortfolio', () => {
  it('evaluates deterministic strategy scenarios and returns one recommendation', () => {
    const first = optimizeEnterprisePackagingPortfolio(container, products, boxes, baseOptions(), 'balanced', 4);
    const second = optimizeEnterprisePackagingPortfolio(container, [...products].reverse(), [...boxes].reverse(), baseOptions(), 'balanced', 4);

    expect(first.scenarios.length).toBeGreaterThan(0);
    expect(first.recommended.plan.assignments).toHaveLength(3);
    expect(first.recommended.plan.shipment.fullyLoaded).toBe(true);
    expect(first.recommended.id).toBe(second.recommended.id);
    expect(first.recommended.plan.totalBoxes).toBe(second.recommended.plan.totalBoxes);
  });

  it('cost objective refuses to hide unknown carton prices', () => {
    const unpriced = boxes.map((box) => ({ ...box, unitCost: undefined }));
    const portfolio = optimizeEnterprisePackagingPortfolio(container, products, unpriced, baseOptions(), 'cost', 3);
    expect(portfolio.costComparisonComplete).toBe(false);
    expect(portfolio.recommended.plan.cost.unpricedCartons).toBeGreaterThan(0);
  });

  it('carton-sku objective prioritizes the smallest safe family among complete scenarios', () => {
    const portfolio = optimizeEnterprisePackagingPortfolio(container, products, boxes, baseOptions(), 'carton-sku', 4);
    const minTypes = Math.min(...portfolio.scenarios.filter((scenario) => scenario.plan.shipment.fullyLoaded).map((scenario) => scenario.plan.family.selectedBoxTypes));
    expect(portfolio.recommended.plan.family.selectedBoxTypes).toBe(minTypes);
  });
});
