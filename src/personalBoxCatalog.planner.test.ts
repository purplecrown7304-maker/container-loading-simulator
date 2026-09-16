import { beforeEach, describe, expect, it } from 'vitest';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import { loginLocalOperator, operatorScopedStorageKey } from './localOperator';
import {
  PERSONAL_BOX_CATALOG_KEY,
  readPersonalBoxCatalog,
  registerRecommendedPersonalBox,
} from './personalBoxCatalog';

const plannerKey = 'container-loading-product-packaging-v1';
const box: BoxCatalogItem = {
  id: 'REC-585X470X290',
  name: '범용 추천 585×470×290 (강도확인)',
  innerLength: 0.575,
  innerWidth: 0.46,
  innerHeight: 0.28,
  outerLength: 0.585,
  outerWidth: 0.47,
  outerHeight: 0.29,
  tareWeightKg: 0.5,
  maxGrossWeightKg: 22,
  maxTopLoadKg: 0,
};

describe('explicit recommendation sync', () => {
  beforeEach(() => localStorage.clear());

  it('adds only a clicked recommendation to both stores with an explicit marker', () => {
    const operator = loginLocalOperator('등록사용자')!;
    const scopedPlannerKey = operatorScopedStorageKey(plannerKey, operator);
    localStorage.setItem(scopedPlannerKey, JSON.stringify({
      container: { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28200 },
      products: [],
      boxes: [],
    }));

    registerRecommendedPersonalBox(operator, box);

    expect(readPersonalBoxCatalog(operator)[0]).toMatchObject({
      id: box.id,
      recommendationRegistration: 'explicit',
    });
    const planner = JSON.parse(localStorage.getItem(scopedPlannerKey) || '{}') as { boxes: Array<Record<string, unknown>> };
    expect(planner.boxes[0]).toMatchObject({
      id: box.id,
      recommendationRegistration: 'explicit',
    });
    expect(localStorage.getItem(operatorScopedStorageKey(PERSONAL_BOX_CATALOG_KEY, operator))).toContain(box.id);
  });
});
