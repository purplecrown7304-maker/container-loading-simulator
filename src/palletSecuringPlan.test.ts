import { describe, expect, it } from 'vitest';
import type { PhysicsTarget } from './physicsTarget';
import { buildSecuringUsage } from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';

const target: PhysicsTarget = {
  mode: 'pallets',
  container: { length: 4.4, width: 2.2, height: 2.6, maxPayloadKg: 5000 },
  cargo: [],
  result: {
    placements: [
      { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 1.1, width: 1.1, height: 1.0, weightKg: 100 },
      { cargoId: 'B', x: 1.1, y: 0, z: 0.15, length: 1.1, width: 1.1, height: 0.5, weightKg: 80 },
    ],
    remaining: [],
    loadedWeightKg: 230,
    usedVolumeM3: 1.815,
    validationIssues: [],
  },
  supports: [
    { id: 'PALLET-01', x: 0, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
    { id: 'PALLET-02', x: 1.1, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
  ],
};

describe('buildPalletSecuringPlan', () => {
  it('calculates securing quantities per pallet using each load height', () => {
    const usage = buildSecuringUsage(target, 2);
    const plan = buildPalletSecuringPlan(target, usage);

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0].palletIndex).toBe(1);
    expect(plan.items[0].bandingStraps).toBe(3);
    expect(plan.items[1].bandingStraps).toBe(3);
    expect(plan.items[0].cornerGuards).toBe(4);
    expect(plan.items[0].loadHeightM).toBeCloseTo(1, 5);
    expect(plan.items[1].loadHeightM).toBeCloseTo(0.5, 5);
    expect(plan.items[0].bandingLengthM).toBeGreaterThan(plan.items[1].bandingLengthM);
    expect(plan.items[0].wrappingLengthM).toBeGreaterThan(plan.items[1].wrappingLengthM);
    expect(plan.totalAddedWeightKg).toBeCloseTo(usage.estimatedAddedWeightKg, 6);
  });

  it('keeps container-level load bars separate from pallet-specific quantities', () => {
    const usage = buildSecuringUsage(target, 3);
    const plan = buildPalletSecuringPlan(target, usage);

    expect(plan.sharedLoadBars).toBe(2);
    expect(plan.sharedLoadBarWeightKg).toBeGreaterThan(0);
    expect(plan.totalAddedWeightKg).toBeCloseTo(usage.estimatedAddedWeightKg, 6);
  });
});
