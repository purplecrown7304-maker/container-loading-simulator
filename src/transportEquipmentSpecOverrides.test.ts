import { beforeEach, describe, expect, it } from 'vitest';
import {
  readTransportEquipmentSpecOverrides,
  setTransportEquipmentSpecOverride,
} from './transportEquipmentSpecOverrides';

const base = {
  length: 13.62,
  width: 2.48,
  height: 2.7,
  maxPayloadKg: 28000,
  floorLoadLimitKgPerM2: 1700,
};

describe('transport equipment axle overrides', () => {
  beforeEach(() => localStorage.clear());

  it('persists valid two-axle specs', () => {
    setTransportEquipmentSpecOverride('custom-truck', {
      ...base,
      frontAxleX: 1.4,
      rearAxleX: 10.8,
      frontAxleMaxKg: 9000,
      rearAxleMaxKg: 19000,
    });
    const stored = readTransportEquipmentSpecOverrides()['custom-truck'];
    expect(stored.frontAxleX).toBe(1.4);
    expect(stored.rearAxleX).toBe(10.8);
    expect(stored.frontAxleMaxKg).toBe(9000);
    expect(stored.rearAxleMaxKg).toBe(19000);
  });

  it('rejects an invalid axle order instead of inventing a usable spec', () => {
    expect(() => setTransportEquipmentSpecOverride('custom-truck', {
      ...base,
      frontAxleX: 9,
      rearAxleX: 2,
    })).toThrow(/앞축 위치 < 뒤축 위치/);
  });
});
