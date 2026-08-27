import { describe, expect, it } from 'vitest';
import { optimizeEnterprisePackaging, estimateShipmentContainers } from './enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const commonBox: BoxCatalogItem = {
  id: 'COMMON', name: '공용박스',
  innerLength: 0.4, innerWidth: 0.3, innerHeight: 0.2,
  outerLength: 0.41, outerWidth: 0.31, outerHeight: 0.21,
  tareWeightKg: 0.5, maxGrossWeightKg: 12, maxTopLoadKg: 50, unitCost: 2,
};

function options(mixed: boolean) {
  return {
    packaging: {
      allowCustomBoxDesign: false,
      maxGeneratedGrossWeightKg: 22,
      generatedBoxTareKg: 0.6,
      clearanceM: 0.01,
      wallThicknessM: 0.004,
      maxGeneratedUnitsPerBox: 24,
      generatedBoxUnitCost: 1.5,
    },
    family: {
      enabled: false,
      targetMaxBoxTypes: 4,
      maxAssignmentScoreLoss: 0.08,
      dimensionRoundingM: 0.01,
      preferCatalog: true,
    },
    allowMixedResidualCartons: mixed,
    maxMixedResidualUnits: 100,
    maxMixedCandidateBoxes: 12,
    maxEstimatedContainers: 20,
    cost: {
      containerFreightCost: 100,
      handlingCostPerCarton: 1,
      newBoxSetupCost: 10,
      cartonSkuCarryCost: 5,
      currency: 'KRW',
    },
  };
}

describe('optimizeEnterprisePackaging', () => {
  it('splits a partial carton so container payload uses its actual weight', () => {
    const product: ProductItem = {
      id: 'A', name: 'A', length: 0.19, width: 0.14, height: 0.09,
      weightKg: 1, quantity: 5, maxUnitsPerBox: 4, orientationPolicy: 'upright', allowMixedCarton: false,
    };
    const plan = optimizeEnterprisePackaging(container, [product], [commonBox], options(false));
    const full = plan.cargo.find((item) => item.id === 'PKG-A');
    const partial = plan.cargo.find((item) => item.id === 'PKG-A-PARTIAL');

    expect(full?.quantity).toBe(1);
    expect(full?.weightKg).toBeCloseTo(4.5, 8);
    expect(partial?.quantity).toBe(1);
    expect(partial?.weightKg).toBeCloseTo(1.5, 8);
    expect(plan.accurateTotalCargoWeightKg).toBeCloseTo(6, 8);
    expect(plan.totalBoxes).toBe(2);
  });

  it('combines compatible residual SKUs into fewer mixed cartons', () => {
    const products: ProductItem[] = [
      { id: 'A', name: 'A', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.4, quantity: 5, maxUnitsPerBox: 4, orientationPolicy: 'base-rotation', allowMixedCarton: true },
      { id: 'B', name: 'B', length: 0.12, width: 0.08, height: 0.1, weightKg: 0.3, quantity: 7, maxUnitsPerBox: 6, orientationPolicy: 'base-rotation', allowMixedCarton: true },
    ];
    const plan = optimizeEnterprisePackaging(container, products, [commonBox], options(true));

    expect(plan.baselineTotalBoxes).toBe(4);
    expect(plan.totalBoxes).toBe(3);
    expect(plan.mixedCartonSavings).toBe(1);
    expect(plan.mixedCartons).toHaveLength(1);
    expect(plan.mixedCartons[0].contents).toEqual([
      { productId: 'A', productName: 'A', quantity: 1 },
      { productId: 'B', productName: 'B', quantity: 1 },
    ]);
    expect(plan.cost.knownCartonCost).toBeGreaterThan(0);
    expect(plan.shipment.fullyLoaded).toBe(true);
  });

  it('prices a residual carton that was eligible for mixing but fell back to dedicated packing', () => {
    const product: ProductItem = {
      id: 'FALLBACK', name: 'Fallback', length: 0.1, width: 0.1, height: 0.1,
      weightKg: 0.5, quantity: 5, maxUnitsPerBox: 4, orientationPolicy: 'upright', allowMixedCarton: true,
    };
    const noMixedCapacity = { ...options(true), maxMixedResidualUnits: 0 };
    const plan = optimizeEnterprisePackaging(container, [product], [commonBox], noMixedCapacity);

    expect(plan.cargo.find((item) => item.id === 'PKG-FALLBACK-PARTIAL')).toBeDefined();
    expect(plan.totalBoxes).toBe(2);
    expect(plan.cost.knownCartonCost).toBeCloseTo(4, 8);
    expect(plan.cost.unpricedCartons).toBe(0);
  });

  it('keeps unverified generated cartons at one operational layer with zero top-load', () => {
    const product: ProductItem = {
      id: 'AUTO', name: 'Auto', length: 0.18, width: 0.12, height: 0.08,
      weightKg: 0.5, quantity: 32, maxUnitsPerBox: 8, orientationPolicy: 'base-rotation',
    };
    const autoOptions = options(false);
    autoOptions.packaging.allowCustomBoxDesign = true;
    autoOptions.family.enabled = false;
    const plan = optimizeEnterprisePackaging(container, [product], [], autoOptions);
    const assignment = plan.assignments[0];
    const cargo = plan.cargo.find((item) => item.id === 'PKG-AUTO');

    expect(assignment.source).toBe('generated');
    expect(assignment.strengthStatus).toBe('design-target');
    expect(assignment.recommendedStackLayers).toBeGreaterThanOrEqual(1);
    expect(assignment.maxStackLayers).toBe(1);
    expect(assignment.maxTopLoadKg).toBe(0);
    expect(cargo?.maxStackLayers).toBe(1);
    expect(cargo?.maxTopLoadKg).toBe(0);
  });

  it('estimates multiple containers by repeatedly consuming loaded quantities', () => {
    const tiny: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 1000 };
    const cargo: CargoItem[] = [{ id: 'X', name: 'X', length: 1, width: 1, height: 1, weightKg: 10, quantity: 3, maxStackLayers: 1, allowRotation: false }];
    const estimate = estimateShipmentContainers(tiny, cargo, 10);
    expect(estimate.containersRequired).toBe(3);
    expect(estimate.fullyLoaded).toBe(true);
    expect(estimate.remaining).toHaveLength(0);
  });
});
