// 대표 제원과 기본 설정값.
// 모든 수치는 업계 대표값이다. 실제 장비 명판, 차량 제원표, 현행 법령으로 교체해서 쓴다.

import type { Config, Dims, Space } from './types';

export const DEFAULT_CONFIG: Config = {
  minSupportRatio: 0.8,
  heightTolerance: 5,
  epsilon: 0.5,
  margins: { l: 30, w: 20, h: 30 },
  forkliftClearance: 80,
  cgLongTolerance: 0.05,
  cgLatTolerance: 0.05,
  cgHeightRatio: 0.5,
  gapWarning: 150,
  payloadRatio: 1.0,
  legalAxleLoad: 10000,
  minFrontAxleRatio: 0.2,
  defaultFriction: 0.45,
  accel: { forward: 0.8, rearward: 0.5, sideways: 0.5 },
  incompatiblePairs: [],
  strictUnloadOrder: true,
};

/** 해상 구간 가속도 (CTU Code 항해 구역 A/B/C) */
export const SEA_ACCEL = {
  A: { forward: 0.3, rearward: 0.3, sideways: 0.5 },
  B: { forward: 0.3, rearward: 0.3, sideways: 0.7 },
  C: { forward: 0.4, rearward: 0.4, sideways: 0.8 },
};

export const CONTAINERS: Record<string, Space> = {
  '20GP': {
    id: '20GP',
    kind: 'container',
    inner: { l: 5898, w: 2352, h: 2393 },
    door: { w: 2340, h: 2280 },
    access: ['rear'],
    maxPayload: 28200,
    tare: 2200,
    floorLineLoad: 4500,
  },
  '40GP': {
    id: '40GP',
    kind: 'container',
    inner: { l: 12032, w: 2352, h: 2393 },
    door: { w: 2340, h: 2280 },
    access: ['rear'],
    maxPayload: 26700,
    tare: 3800,
    floorLineLoad: 3000,
  },
  '40HC': {
    id: '40HC',
    kind: 'container',
    inner: { l: 12032, w: 2352, h: 2698 },
    door: { w: 2340, h: 2585 },
    access: ['rear'],
    maxPayload: 26500,
    tare: 3900,
    floorLineLoad: 3000,
  },
  '45HC': {
    id: '45HC',
    kind: 'container',
    inner: { l: 13556, w: 2352, h: 2698 },
    door: { w: 2340, h: 2585 },
    access: ['rear'],
    maxPayload: 27600,
    tare: 4800,
    floorLineLoad: 3000,
  },
};

/**
 * 트럭 예시. 적재함 치수는 대표값이고 축 관련 수치는 계산 구조를 보여 주기 위한
 * 가상의 값이다. 반드시 실제 차량 제원표의 값으로 바꿔 넣는다.
 */
export const TRUCKS: Record<string, Space> = {
  '5T_WING': {
    id: '5T_WING',
    kind: 'truck',
    inner: { l: 6200, w: 2350, h: 2400 },
    access: ['left', 'right', 'rear'],
    maxPayload: 5000,
    tare: 6000,
    axles: {
      frontX: -1300,
      rearX: 3900,
      emptyFront: 3200,
      emptyRear: 2800,
      maxFront: 5000,
      maxRear: 10000,
      rearAxleCount: 1,
      maxGross: 11500,
    },
  },
  '11T_WING': {
    id: '11T_WING',
    kind: 'truck',
    inner: { l: 9100, w: 2350, h: 2400 },
    access: ['left', 'right', 'rear'],
    maxPayload: 11000,
    tare: 10500,
    axles: {
      frontX: -1400,
      rearX: 5600,
      emptyFront: 5200,
      emptyRear: 5300,
      maxFront: 7500,
      maxRear: 19000,
      rearAxleCount: 2,
      maxGross: 24000,
    },
  },
};

/** 파렛트 평면 치수와 높이(mm), 자중(kg) 대표값 */
export const PALLETS: Record<string, Dims & { weight: number }> = {
  T11: { l: 1100, w: 1100, h: 150, weight: 25 },
  T12: { l: 1200, w: 1000, h: 150, weight: 25 },
  EUR: { l: 1200, w: 800, h: 144, weight: 25 },
};
