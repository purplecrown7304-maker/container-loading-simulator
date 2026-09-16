import { beforeEach, describe, expect, it } from 'vitest';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { LocalOperator } from './localOperator';
import {
  personalBoxCatalogKey,
  readPersonalBoxCatalog,
  registerRecommendedPersonalBox,
} from './personalBoxCatalog';

const operator: LocalOperator = { id: 'park', name: '박흥신' };

const recommendedBox: BoxCatalogItem = {
  id: 'REC-655X335X790',
  name: '범용 추천 655×335×790 (강도확인)',
  innerLength: 0.645,
  innerWidth: 0.325,
  innerHeight: 0.78,
  outerLength: 0.655,
  outerWidth: 0.335,
  outerHeight: 0.79,
  tareWeightKg: 0.5,
  maxGrossWeightKg: 22,
  maxTopLoadKg: 0,
};

describe('personal recommendation box registration', () => {
  beforeEach(() => localStorage.clear());

  it('removes recommendation rows that were never explicitly registered', () => {
    localStorage.setItem(personalBoxCatalogKey(operator), JSON.stringify([{
      id: recommendedBox.id,
      name: recommendedBox.name,
      length: recommendedBox.outerLength,
      width: recommendedBox.outerWidth,
      height: recommendedBox.outerHeight,
      weightKg: 22,
      quantity: 0,
      maxStackLayers: 1,
      maxTopLoadKg: 0,
      allowRotation: true,
    }]));

    expect(readPersonalBoxCatalog(operator)).toEqual([]);
    expect(JSON.parse(localStorage.getItem(personalBoxCatalogKey(operator)) || '[]')).toEqual([]);
  });

  it('keeps a recommendation only after the user explicitly registers it', () => {
    registerRecommendedPersonalBox(operator, recommendedBox);
    const catalog = readPersonalBoxCatalog(operator);

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: recommendedBox.id,
      catalogOrigin: 'recommendation',
      recommendationRegistration: 'explicit',
    });
  });
});
