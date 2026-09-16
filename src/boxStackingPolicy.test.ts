import { describe, expect, it } from 'vitest';
import { applyPersonalStackPolicyToCargo, effectivePlannerTopLoadKg } from './boxStackingPolicy';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { CargoItem } from './engine/types';

const plannerBox: BoxCatalogItem = {
  id: 'REC-570X750X330',
  name: '범용 추천 570×750×330 (강도확인)',
  innerLength: 0.562,
  innerWidth: 0.742,
  innerHeight: 0.322,
  outerLength: 0.57,
  outerWidth: 0.75,
  outerHeight: 0.33,
  tareWeightKg: 0.6,
  maxGrossWeightKg: 22,
  maxTopLoadKg: 0,
};

const cargo: CargoItem = {
  id: 'PKG-PRD-004',
  name: '제품 · 박스',
  length: 0.57,
  width: 0.75,
  height: 0.33,
  weightKg: 9.6,
  quantity: 416,
  maxStackLayers: 1,
  maxTopLoadKg: 0,
};

describe('personal box stacking policy', () => {
  it('restores a user-declared 10-layer limit instead of keeping the legacy one-layer fallback', () => {
    const next = applyPersonalStackPolicyToCargo(cargo, { maxStackLayers: 10, maxTopLoadKg: 0 });
    expect(next.maxStackLayers).toBe(10);
    expect(next.maxTopLoadKg).toBeUndefined();
  });

  it('keeps a positive top-load limit as an additional hard constraint', () => {
    const next = applyPersonalStackPolicyToCargo(cargo, { maxStackLayers: 10, maxTopLoadKg: 80 });
    expect(next.maxStackLayers).toBe(10);
    expect(next.maxTopLoadKg).toBe(80);
  });

  it('keeps an explicit one-layer zero-top-load box fail-closed', () => {
    const next = applyPersonalStackPolicyToCargo(cargo, { maxStackLayers: 1, maxTopLoadKg: 0 });
    expect(next.maxStackLayers).toBe(1);
    expect(next.maxTopLoadKg).toBe(0);
  });

  it('translates the declared layer limit into a conservative planner top-load value', () => {
    expect(effectivePlannerTopLoadKg(plannerBox, { maxStackLayers: 10, maxTopLoadKg: 0 })).toBe(198);
    expect(effectivePlannerTopLoadKg(plannerBox, { maxStackLayers: 10, maxTopLoadKg: 80 })).toBe(80);
  });

  it('does not let an old derived planner value block a later higher personal layer setting', () => {
    const previouslyDerived = { ...plannerBox, maxTopLoadKg: 198 };
    expect(effectivePlannerTopLoadKg(previouslyDerived, { maxStackLayers: 12, maxTopLoadKg: 0 })).toBe(242);
  });
});
