import { beforeEach, describe, expect, it } from 'vitest';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { LocalOperator } from './localOperator';
import {
  personalBoxCatalogKey,
  readPersonalBoxCatalog,
  registerRecommendedPersonalBox,
  writePersonalBoxCatalog,
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

  it('preserves the recommended stack limit instead of forcing one layer', () => {
    const item = registerRecommendedPersonalBox(operator, { ...recommendedBox, maxStackLayers: 10, maxTopLoadKg: 100 });
    expect(item.maxStackLayers).toBe(10);
    expect(item.maxTopLoadKg).toBe(100);
  });

  it('does not invent a one-layer limit when none is declared, and retains zero top load', () => {
    const item = registerRecommendedPersonalBox(operator, recommendedBox);
    expect(item.maxStackLayers).toBeUndefined();
    expect(item.maxTopLoadKg).toBe(0);
  });

  it('preserves existing user limits when a recommendation is registered again', () => {
    const item = registerRecommendedPersonalBox(operator, recommendedBox);
    writePersonalBoxCatalog(operator, [{ ...item, maxStackLayers: 5, maxTopLoadKg: 40 }]);
    const updated = registerRecommendedPersonalBox(operator, { ...recommendedBox, maxStackLayers: 10, maxTopLoadKg: 100 });
    expect(updated.maxStackLayers).toBe(5);
    expect(updated.maxTopLoadKg).toBe(40);
  });

  it('retains an explicitly declared single-layer limit', () => {
    const item = registerRecommendedPersonalBox(operator, { ...recommendedBox, maxStackLayers: 1 });
    expect(item.maxStackLayers).toBe(1);
    expect(item.maxTopLoadKg).toBe(0);
  });

  it('keeps the conservative compression default when the recommendation has no strength data', () => {
    const item = registerRecommendedPersonalBox(operator, { ...recommendedBox, maxStackLayers: 10, maxTopLoadKg: undefined });
    expect(item.maxStackLayers).toBe(10);
    expect(item.maxTopLoadKg).toBe(0);
  });

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
