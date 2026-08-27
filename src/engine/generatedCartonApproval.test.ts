import { describe, expect, it } from 'vitest';
import { approveGeneratedCarton } from './generatedCartonApproval';
import type { ProductPackagingAssignment } from './productPackagingOptimizer';

const generated: ProductPackagingAssignment = {
  productId: 'A', productName: 'A', boxId: 'AUTO-A-1', boxName: '자동설계', source: 'generated',
  unitsPerBox: 8, boxesNeeded: 10,
  outerLength: 0.4, outerWidth: 0.3, outerHeight: 0.25,
  innerLength: 0.39, innerWidth: 0.29, innerHeight: 0.24,
  grossWeightKg: 6, productFillRate: 0.7, containerTileEfficiency: 0.8, simulatedLoadedBoxes: 10,
  maxStackLayers: 1, recommendedStackLayers: 5, maxTopLoadKg: 0, requiredTopLoadKg: 24,
  strengthStatus: 'design-target', score: 0.8,
};

describe('generated carton approval', () => {
  it('turns an explicitly verified generated carton into a catalog carton', () => {
    const result = approveGeneratedCarton(generated, {
      catalogId: 'VER-A', catalogName: '승인 A', tareWeightKg: 0.7, packedProductWeightKg: 5.4,
      maxGrossWeightKg: 10, verifiedTopLoadKg: 25, unitCost: 1.2,
    });
    expect(result.error).toBeUndefined();
    expect(result.verifiedGrossWeightKg).toBeCloseTo(6.1, 8);
    expect(result.recalculatedRequiredTopLoadKg).toBeCloseTo(24.4, 8);
    expect(result.meetsDesignTarget).toBe(true);
    expect(result.box).toMatchObject({ id: 'VER-A', maxTopLoadKg: 25, maxGrossWeightKg: 10, tareWeightKg: 0.7, unitCost: 1.2 });
    expect(result.box?.outerLength).toBe(generated.outerLength);
    expect(result.box?.innerHeight).toBe(generated.innerHeight);
  });

  it('allows a lower verified top-load but marks that the recalculated design target was not met', () => {
    const result = approveGeneratedCarton(generated, {
      catalogId: 'VER-LOW', tareWeightKg: 0.7, packedProductWeightKg: 5.4,
      maxGrossWeightKg: 10, verifiedTopLoadKg: 12,
    });
    expect(result.error).toBeUndefined();
    expect(result.meetsDesignTarget).toBe(false);
    expect(result.box?.maxTopLoadKg).toBe(12);
  });

  it('rejects max gross weight below actual verified tare plus packed product payload', () => {
    const result = approveGeneratedCarton(generated, {
      catalogId: 'VER-BAD', tareWeightKg: 1.2, packedProductWeightKg: 5.4,
      maxGrossWeightKg: 6.5, verifiedTopLoadKg: 30,
    });
    expect(result.box).toBeUndefined();
    expect(result.verifiedGrossWeightKg).toBeCloseTo(6.6, 8);
    expect(result.error).toMatch(/자중\+내용물/);
  });

  it('does not approve an already catalog-verified assignment through this path', () => {
    const result = approveGeneratedCarton({ ...generated, source: 'catalog', strengthStatus: 'catalog' }, {
      catalogId: 'VER-X', tareWeightKg: 0.7, packedProductWeightKg: 5.4,
      maxGrossWeightKg: 10, verifiedTopLoadKg: 30,
    });
    expect(result.box).toBeUndefined();
    expect(result.error).toMatch(/자동설계/);
  });
});
