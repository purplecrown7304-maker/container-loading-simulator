import { describe, expect, it } from 'vitest';
import { standardizeProductCartons } from './cartonStandardization';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

const sharedBox: BoxCatalogItem = {
  id: 'BOX-SHARED',
  name: '공용 400×300×250',
  innerLength: 0.39,
  innerWidth: 0.29,
  innerHeight: 0.24,
  outerLength: 0.4,
  outerWidth: 0.3,
  outerHeight: 0.25,
  tareWeightKg: 0.5,
  maxGrossWeightKg: 20,
  maxTopLoadKg: 80,
};

describe('carton standardization', () => {
  it('can consolidate compatible products into one shared carton SKU', () => {
    const products: ProductItem[] = [
      { id: 'A', name: 'A', length: 0.18, width: 0.12, height: 0.08, weightKg: 0.5, quantity: 120, maxUnitsPerBox: 12 },
      { id: 'B', name: 'B', length: 0.19, width: 0.11, height: 0.08, weightKg: 0.45, quantity: 100, maxUnitsPerBox: 12 },
    ];
    const result = standardizeProductCartons(container, products, [sharedBox], {
      targetBoxSkuCount: 1,
      maxAssignmentScoreLoss: 1,
      minProductFillRate: 0.1,
      maxCandidates: 12,
      baseCostPerBox: 0.3,
      volumeCostPerM3: 2,
      skuSetupCost: 30,
      packagingOptions: {
        allowCustomBoxDesign: false,
        maxGeneratedGrossWeightKg: 22,
        generatedBoxTareKg: 0.6,
        clearanceM: 0.01,
        wallThicknessM: 0.004,
        maxGeneratedUnitsPerBox: 24,
      },
    });

    expect(result.rejected).toEqual([]);
    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map(item => item.boxId)).size).toBe(1);
    expect(result.standardizedBoxSkuCount).toBe(1);
    expect(result.estimatedContainersNeeded).toBeGreaterThan(0);
    expect(result.estimatedContainerUtilization).toBeGreaterThan(0);
    expect(result.estimatedTotalCost).toBeGreaterThan(0);
  });

  it('does not force an incompatible product into the requested SKU cap', () => {
    const products: ProductItem[] = [
      { id: 'SMALL', name: 'small', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.2, quantity: 40, maxUnitsPerBox: 8 },
      { id: 'LONG', name: 'long', length: 0.9, width: 0.2, height: 0.15, weightKg: 3, quantity: 20, maxUnitsPerBox: 2 },
    ];
    const result = standardizeProductCartons(container, products, [], {
      targetBoxSkuCount: 1,
      maxAssignmentScoreLoss: 0.05,
      minProductFillRate: 0.5,
      maxCandidates: 12,
      baseCostPerBox: 0.3,
      volumeCostPerM3: 2,
      skuSetupCost: 30,
      packagingOptions: {
        allowCustomBoxDesign: true,
        maxGeneratedGrossWeightKg: 22,
        generatedBoxTareKg: 0.6,
        clearanceM: 0.01,
        wallThicknessM: 0.004,
        maxGeneratedUnitsPerBox: 12,
      },
    });

    expect(result.assignments).toHaveLength(2);
    expect(result.standardizedBoxSkuCount).toBeGreaterThanOrEqual(1);
    for (const assignment of result.assignments) {
      expect(assignment.unitsPerBox).toBeGreaterThan(0);
      expect(assignment.grossWeightKg).toBeGreaterThan(0);
      expect(assignment.scoreLoss).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});
