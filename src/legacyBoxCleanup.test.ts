import { describe, expect, it } from 'vitest';
import type { CargoItem } from './engine/types';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import {
  isLegacyPlannerSampleBox,
  isLegacySyntheticCatalogBox,
  removeLegacyPlannerSampleBoxes,
  removeLegacySyntheticCargoBoxes,
} from './legacyBoxCleanup';

const legacySeed: CargoItem = {
  id: 'BOX-001',
  name: '가상 화물 01',
  length: 0.4,
  width: 0.3,
  height: 0.25,
  weightKg: 8,
  quantity: 999,
  maxStackLayers: 3,
  maxTopLoadKg: 24,
  allowRotation: true,
};

const realUserBoxSameId: CargoItem = {
  ...legacySeed,
  name: '사용자 실제 박스',
  length: 0.41,
};

const legacyPlannerSample: BoxCatalogItem = {
  id: 'BOX-604040',
  name: '600×400×400',
  innerLength: 0.59,
  innerWidth: 0.39,
  innerHeight: 0.39,
  outerLength: 0.6,
  outerWidth: 0.4,
  outerHeight: 0.4,
  tareWeightKg: 0.8,
  maxGrossWeightKg: 22,
  maxTopLoadKg: 80,
  unitCost: 1.2,
};

const realPlannerBoxSameId: BoxCatalogItem = {
  ...legacyPlannerSample,
  name: '회사 실제 600 박스',
};

describe('legacy unregistered box cleanup', () => {
  it('identifies the old virtual 18-box seed without relying on quantity', () => {
    expect(isLegacySyntheticCatalogBox(legacySeed)).toBe(true);
    expect(isLegacySyntheticCatalogBox(realUserBoxSameId)).toBe(false);
  });

  it('removes only old synthetic personal boxes and preserves real user boxes', () => {
    const cleaned = removeLegacySyntheticCargoBoxes([legacySeed, realUserBoxSameId]);
    expect(cleaned).toEqual([realUserBoxSameId]);
  });

  it('identifies exact old planner samples and preserves repurposed same-id boxes', () => {
    expect(isLegacyPlannerSampleBox(legacyPlannerSample)).toBe(true);
    expect(isLegacyPlannerSampleBox(realPlannerBoxSameId)).toBe(false);
  });

  it('removes old planner sample boxes from owned-box state', () => {
    const cleaned = removeLegacyPlannerSampleBoxes([legacyPlannerSample, realPlannerBoxSameId]);
    expect(cleaned).toEqual([realPlannerBoxSameId]);
  });
});
