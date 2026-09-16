import { describe, expect, it } from 'vitest';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import { mergePersonalBoxStackingIntoPlanner, type EnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import type { PersonalBoxCatalogItem } from './personalBoxCatalog';

const box: BoxCatalogItem = {
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

const state: EnterprisePackagingPlannerState = {
  products: [],
  boxes: [box],
  container: { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 },
};

const personal: PersonalBoxCatalogItem = {
  id: box.id,
  name: box.name,
  length: box.outerLength,
  width: box.outerWidth,
  height: box.outerHeight,
  weightKg: 22,
  quantity: 0,
  maxStackLayers: 10,
  maxTopLoadKg: 0,
  allowRotation: true,
  catalogOrigin: 'recommendation',
  recommendationRegistration: 'explicit',
};

describe('planner personal-box stacking overlay', () => {
  it('migrates an existing personal maxStackLayers=10 into the matching planner box', () => {
    const merged = mergePersonalBoxStackingIntoPlanner(state, [personal]);
    const mergedBox = merged.boxes[0] as BoxCatalogItem & { maxStackLayers?: number };
    expect(mergedBox.maxStackLayers).toBe(10);
    expect(mergedBox.maxTopLoadKg).toBe(198);
  });

  it('does not apply stack settings to a different box id', () => {
    const merged = mergePersonalBoxStackingIntoPlanner(state, [{ ...personal, id: 'OTHER' }]);
    expect(merged).toBe(state);
  });
});
