import { beforeEach, describe, expect, it } from 'vitest';
import { loginLocalOperator } from './localOperator';
import {
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';

const container = { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28200 };
const recommendation = {
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

describe('enterprise planner recommendation ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    loginLocalOperator('추천테스트');
  });

  it('does not persist an unapproved recommendation as an owned box', () => {
    writeEnterprisePackagingPlannerState({ container, products: [], boxes: [recommendation] });
    expect(readEnterprisePackagingPlannerState()?.boxes).toEqual([]);
  });

  it('preserves an explicitly registered recommendation', () => {
    const explicit = { ...recommendation, recommendationRegistration: 'explicit' as const };
    writeEnterprisePackagingPlannerState({ container, products: [], boxes: [explicit] });
    expect(readEnterprisePackagingPlannerState()?.boxes.map(box => box.id)).toEqual([recommendation.id]);
  });
});
