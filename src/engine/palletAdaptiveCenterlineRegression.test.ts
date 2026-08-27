import { describe, expect, it } from 'vitest';
import { calculateAdaptiveLateralImbalanceKg } from './palletAdaptiveSearch';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

function pallet(y: number, totalWeightKg: number) {
  return {
    centerOfGravity: { x: 1, y, z: 0.5 },
    totalWeightKg,
  };
}

describe('adaptive pallet lateral imbalance regression', () => {
  it('treats an exact centerline pallet as neutral instead of right-side weight', () => {
    expect(calculateAdaptiveLateralImbalanceKg([
      pallet(container.width / 2, 900),
    ], container)).toBe(0);
  });

  it('keeps centerline weight neutral when left and right pallets are balanced', () => {
    expect(calculateAdaptiveLateralImbalanceKg([
      pallet(0.55, 700),
      pallet(container.width / 2, 1200),
      pallet(1.8, 700),
    ], container)).toBe(0);
  });

  it('still reports real left-right imbalance away from the centerline', () => {
    expect(calculateAdaptiveLateralImbalanceKg([
      pallet(0.55, 900),
      pallet(1.8, 600),
    ], container)).toBe(300);
  });

  it('treats tiny floating-point noise around the centerline as neutral', () => {
    expect(calculateAdaptiveLateralImbalanceKg([
      pallet(container.width / 2 + 5e-7, 1000),
    ], container)).toBe(0);
  });
});
