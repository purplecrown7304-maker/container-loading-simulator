import { describe, expect, it } from 'vitest';
import { searchEnterprisePackagingScenarios } from './enterprisePackagingScenarioSearch';
import { defaultEnterprisePackagingOptions } from './enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const boxes: BoxCatalogItem[] = [
  { id: 'B1', name: 'B1', innerLength: 0.39, innerWidth: 0.29, innerHeight: 0.24, outerLength: 0.4, outerWidth: 0.3, outerHeight: 0.25, tareWeightKg: 0.5, maxGrossWeightKg: 20, maxTopLoadKg: 80, unitCost: 1.2 },
  { id: 'B2', name: 'B2', innerLength: 0.49, innerWidth: 0.29, innerHeight: 0.29, outerLength: 0.5, outerWidth: 0.3, outerHeight: 0.3, tareWeightKg: 0.6, maxGrossWeightKg: 22, maxTopLoadKg: 90, unitCost: 1.4 },
];
const products: ProductItem[] = [
  { id: 'A', name: 'A', length: 0.18, width: 0.12, height: 0.08, weightKg: 0.5, quantity: 48, maxUnitsPerBox: 8, orientationPolicy: 'base-rotation', allowMixedCarton: true },
  { id: 'B', name: 'B', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.4, quantity: 46, maxUnitsPerBox: 8, orientationPolicy: 'base-rotation', allowMixedCarton: true },
];

function pricedOptions() {
  return {
    ...defaultEnterprisePackagingOptions,
    packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: true },
    cost: {
      ...defaultEnterprisePackagingOptions.cost,
      containerFreightCost: 1000,
      handlingCostPerCarton: 1,
      newBoxSetupCost: 10,
      cartonSkuCarryCost: 5,
      currency: 'KRW',
    },
  };
}

describe('enterprise packaging scenario search', () => {
  it('evaluates alternatives and returns a deterministic feasible recommendation', () => {
    const baseOptions = pricedOptions();
    const first = searchEnterprisePackagingScenarios(container, products, boxes, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: 3,
      compareCustomBoxDesign: true,
      compareMixedResidualCartons: true,
      baseOptions,
    });
    const second = searchEnterprisePackagingScenarios(container, products, boxes, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: 3,
      compareCustomBoxDesign: true,
      compareMixedResidualCartons: true,
      baseOptions,
    });

    expect(first.scenarios.length).toBeGreaterThan(0);
    expect(first.pareto.length).toBeGreaterThan(0);
    expect(first.recommended?.feasible).toBe(true);
    expect(first.recommended?.id).toBe(second.recommended?.id);
    expect(first.recommended?.plan.rejected).toEqual([]);
    expect(first.recommended?.plan.shipment.fullyLoaded).toBe(true);
  });

  it('bounds carton-family target exploration by active product count', () => {
    const result = searchEnterprisePackagingScenarios(container, products, boxes, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: 12,
      compareCustomBoxDesign: true,
      compareMixedResidualCartons: true,
      baseOptions: pricedOptions(),
    });

    const familyScenarios = result.scenarios.filter((scenario) => scenario.familyEnabled);
    expect(familyScenarios.every((scenario) => scenario.targetBoxTypes <= products.length)).toBe(true);
    // Raw search ceiling is 2 custom × 2 mixed × 2 targets plus one baseline;
    // result deduplication can only reduce this count.
    expect(result.scenarios.length).toBeLessThanOrEqual(9);
  });

  it('does not treat unpriced cartons as a zero-cost advantage', () => {
    const unpricedBoxes = boxes.map((box) => ({ ...box, unitCost: undefined }));
    const result = searchEnterprisePackagingScenarios(container, products, unpricedBoxes, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: 2,
      compareCustomBoxDesign: false,
      compareMixedResidualCartons: false,
      baseOptions: {
        ...defaultEnterprisePackagingOptions,
        packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: false },
      },
    });

    expect(result.scenarios.some((scenario) => !scenario.completeCost)).toBe(true);
    expect(result.recommended).toBeDefined();
    expect(result.recommended?.feasible).toBe(true);
  });
});
