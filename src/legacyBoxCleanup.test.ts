import { beforeEach, describe, expect, it } from 'vitest';
import type { CargoItem } from './engine/types';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import {
  cleanupLegacyUnregisteredBoxes,
  isLegacyAutoRecommendedPersonalBox,
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

const legacyRecommendedBox: CargoItem = {
  id: 'REC-570X750X330',
  name: '범용 추천 570×750×330 (강도확인)',
  length: 0.57,
  width: 0.75,
  height: 0.33,
  weightKg: 22,
  quantity: 0,
  maxStackLayers: 1,
  maxTopLoadKg: 0,
  allowRotation: true,
};

const legacyRecommendedBoxWithImplicitDefaults: CargoItem = {
  id: 'REC-650X330X390',
  name: '범용 추천 650×330×390 (강도확인)',
  length: 0.65,
  width: 0.33,
  height: 0.39,
  weightKg: 22,
  quantity: 0,
  maxStackLayers: 1,
  maxTopLoadKg: 0,
};

const realUserRecommendedCode: CargoItem = {
  ...legacyRecommendedBox,
  name: '사용자가 직접 등록한 대형 박스',
};

const unapprovedModifiedRecommendation: CargoItem = {
  ...legacyRecommendedBox,
  maxStackLayers: 3,
};

const explicitRecommendedBox = {
  ...legacyRecommendedBox,
  recommendationRegistration: 'explicit' as const,
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
  beforeEach(() => localStorage.clear());

  it('identifies the old virtual 18-box seed without relying on quantity', () => {
    expect(isLegacySyntheticCatalogBox(legacySeed)).toBe(true);
    expect(isLegacySyntheticCatalogBox(realUserBoxSameId)).toBe(false);
  });

  it('identifies historical REC recommendation boxes shown as personal boxes', () => {
    expect(isLegacyAutoRecommendedPersonalBox(legacyRecommendedBox)).toBe(true);
    expect(isLegacyAutoRecommendedPersonalBox({
      ...legacyRecommendedBox,
      id: 'REC-655X335X790',
      name: '범용 추천 655×335×790 (강도확인)',
      length: 0.655,
      width: 0.335,
      height: 0.79,
    })).toBe(true);
    expect(isLegacyAutoRecommendedPersonalBox({
      ...legacyRecommendedBox,
      id: 'REC-655X335X790-2',
      name: '추가추천 655×335×790 (강도확인)',
    })).toBe(true);
  });

  it('does not treat metadata edits as user approval', () => {
    expect(isLegacyAutoRecommendedPersonalBox(legacyRecommendedBoxWithImplicitDefaults)).toBe(true);
    expect(isLegacyAutoRecommendedPersonalBox(unapprovedModifiedRecommendation)).toBe(true);
  });

  it('preserves real user boxes and explicitly registered recommendations', () => {
    expect(isLegacyAutoRecommendedPersonalBox(realUserRecommendedCode)).toBe(false);
    expect(isLegacyAutoRecommendedPersonalBox(explicitRecommendedBox)).toBe(false);
  });

  it('removes unapproved recommendations while preserving explicit registrations', () => {
    const cleaned = removeLegacySyntheticCargoBoxes([
      legacySeed,
      realUserBoxSameId,
      legacyRecommendedBox,
      legacyRecommendedBoxWithImplicitDefaults,
      realUserRecommendedCode,
      unapprovedModifiedRecommendation,
      explicitRecommendedBox,
    ]);
    expect(cleaned).toEqual([realUserBoxSameId, realUserRecommendedCode, explicitRecommendedBox]);
  });

  it('identifies exact old planner samples and preserves repurposed same-id boxes', () => {
    expect(isLegacyPlannerSampleBox(legacyPlannerSample)).toBe(true);
    expect(isLegacyPlannerSampleBox(realPlannerBoxSameId)).toBe(false);
  });

  it('removes old planner sample boxes from owned-box state', () => {
    const cleaned = removeLegacyPlannerSampleBoxes([legacyPlannerSample, realPlannerBoxSameId]);
    expect(cleaned).toEqual([realPlannerBoxSameId]);
  });

  it('removes unapproved REC boxes from persisted planner state but keeps explicit ones', () => {
    const plannerKey = 'container-loading-product-packaging-v1:test-user';
    const unapprovedPlannerBox = {
      id: 'REC-700X470X290',
      name: '범용 추천 700×470×290 (강도확인)',
      innerLength: 0.69,
      innerWidth: 0.46,
      innerHeight: 0.28,
      outerLength: 0.7,
      outerWidth: 0.47,
      outerHeight: 0.29,
      tareWeightKg: 0.5,
      maxGrossWeightKg: 22,
      maxTopLoadKg: 0,
    };
    const explicitPlannerBox = { ...unapprovedPlannerBox, id: 'REC-700X470X290-2', recommendationRegistration: 'explicit' };
    localStorage.setItem(plannerKey, JSON.stringify({
      container: { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28200 },
      products: [],
      boxes: [unapprovedPlannerBox, explicitPlannerBox],
    }));

    cleanupLegacyUnregisteredBoxes();

    const saved = JSON.parse(localStorage.getItem(plannerKey) || '{}') as { boxes: Array<{ id: string }> };
    expect(saved.boxes.map(box => box.id)).toEqual(['REC-700X470X290-2']);
  });
});
