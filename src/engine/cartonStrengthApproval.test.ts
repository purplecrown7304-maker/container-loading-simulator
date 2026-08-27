import { describe, expect, it } from 'vitest';
import {
  approveGeneratedCarton,
  approveGeneratedCartonFamily,
  groupCartonApprovalCandidates,
  verifiedStackLayers,
} from './cartonStrengthApproval';
import type { ProductItem, ProductPackagingAssignment } from './productPackagingOptimizer';

const product: ProductItem = {
  id: 'P1', name: '제품', length: 0.2, width: 0.1, height: 0.08,
  weightKg: 1, quantity: 100, maxUnitsPerBox: 8,
};

const assignment: ProductPackagingAssignment = {
  productId: 'P1', productName: '제품', boxId: 'AUTO-P1-1', boxName: '자동설계', source: 'generated',
  unitsPerBox: 8, boxesNeeded: 13,
  innerLength: 0.402, innerWidth: 0.202, innerHeight: 0.162,
  outerLength: 0.409, outerWidth: 0.209, outerHeight: 0.169,
  grossWeightKg: 8.6,
  productFillRate: 0.8, containerTileEfficiency: 0.7, simulatedLoadedBoxes: 13,
  maxStackLayers: 1, recommendedStackLayers: 7, maxTopLoadKg: 0,
  requiredTopLoadKg: 51.6, strengthStatus: 'design-target', score: 0.8,
};

describe('cartonStrengthApproval', () => {
  it('requires independently verified tare, gross and top-load strength', () => {
    const tooWeak = approveGeneratedCarton(assignment, product, {
      catalogId: 'VER-P1', verifiedTareWeightKg: 0.9, verifiedMaxTopLoadKg: 30, verifiedMaxGrossWeightKg: 8,
    });
    expect(tooWeak.ok).toBe(false);

    const approved = approveGeneratedCarton(assignment, product, {
      catalogId: 'VER-P1', verifiedTareWeightKg: 0.9, verifiedMaxTopLoadKg: 60, verifiedMaxGrossWeightKg: 10, unitCost: 1.2,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.box.tareWeightKg).toBe(0.9);
    expect(approved.verifiedFullGrossWeightKg).toBeCloseTo(8.9, 8);
    expect(approved.box.maxTopLoadKg).toBe(60);
    expect(approved.box.maxGrossWeightKg).toBe(10);
    expect(approved.box.unitCost).toBe(1.2);
    expect(approved.requiredTopLoadKg).toBeCloseTo(53.4, 8);
    expect(approved.productCount).toBe(1);
  });

  it('rounds manufacturing outer dimensions upward without shrinking the fit envelope', () => {
    const approved = approveGeneratedCarton(assignment, product, {
      catalogId: 'VER-P1', verifiedTareWeightKg: 0.9, verifiedMaxTopLoadKg: 60, verifiedMaxGrossWeightKg: 10, manufacturingStepMm: 5,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(Math.round(approved.box.outerLength * 1000) % 5).toBe(0);
    expect(Math.round(approved.box.outerWidth * 1000) % 5).toBe(0);
    expect(Math.round(approved.box.outerHeight * 1000) % 5).toBe(0);
    expect(approved.box.outerLength).toBeGreaterThanOrEqual(assignment.outerLength);
    expect(approved.box.outerWidth).toBeGreaterThanOrEqual(assignment.outerWidth);
    expect(approved.box.outerHeight).toBeGreaterThanOrEqual(assignment.outerHeight);
  });

  it('groups the same physical auto carton across products and validates the heaviest full carton once', () => {
    const product2: ProductItem = { ...product, id: 'P2', name: '무거운 제품', weightKg: 1.2 };
    const assignment2: ProductPackagingAssignment = {
      ...assignment,
      productId: 'P2', productName: '무거운 제품', boxId: 'AUTO-P2-9',
      grossWeightKg: 10.2, requiredTopLoadKg: 61.2,
    };
    const groups = groupCartonApprovalCandidates([assignment, assignment2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].productIds).toEqual(['P1', 'P2']);

    const weak = approveGeneratedCartonFamily(groups[0], [product, product2], {
      catalogId: 'VER-SHARED', verifiedTareWeightKg: 0.9, verifiedMaxTopLoadKg: 80, verifiedMaxGrossWeightKg: 10,
    });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.reason).toContain('가장 무거운');

    const approved = approveGeneratedCartonFamily(groups[0], [product, product2], {
      catalogId: 'VER-SHARED', verifiedTareWeightKg: 0.9, verifiedMaxTopLoadKg: 80, verifiedMaxGrossWeightKg: 11,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.productCount).toBe(2);
    expect(approved.verifiedFullGrossWeightKg).toBeCloseTo(10.5, 8);
    expect(approved.requiredTopLoadKg).toBeCloseTo(63, 8);
  });

  it('derives operational stack only from verified top-load and verified full gross weight', () => {
    expect(verifiedStackLayers(assignment, 0, 8.9)).toBe(1);
    expect(verifiedStackLayers(assignment, 17.8, 8.9)).toBe(3);
    expect(verifiedStackLayers(assignment, 999, 8.9)).toBe(7);
  });
});
