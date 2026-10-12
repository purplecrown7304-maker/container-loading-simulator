import { describe, expect, it } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsTarget } from './physicsTarget';
import { buildSecuringUsage, createPhysicsTargetSignature, isInertiaStable, securingProfileForUsage } from './inertiaCertification';

function animation(shift: number, tilt: number, extra: Partial<InertiaAnimationResult> = {}): InertiaAnimationResult {
  return {
    scenario: 'braking',
    fps: 30,
    simulatedSeconds: 4,
    cargoCount: 1,
    supportCount: 1,
    frames: [],
    maxHorizontalShiftM: shift,
    maxTiltDeg: tilt,
    ...extra,
  };
}

const palletTarget: PhysicsTarget = {
  mode: 'pallets',
  container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
  cargo: [{ id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1 }],
  result: {
    placements: [
      { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.4, height: 0.3, weightKg: 10 },
      { cargoId: 'A', x: 1.1, y: 0, z: 0.15, length: 0.5, width: 0.4, height: 0.6, weightKg: 10 },
    ],
    remaining: [],
    loadedWeightKg: 70,
    usedVolumeM3: 0.18,
    validationIssues: [],
  },
  supports: [
    { id: 'P1', x: 0, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
    { id: 'P2', x: 1.1, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
  ],
};

const boxTarget: PhysicsTarget = {
  mode: 'boxes',
  container: palletTarget.container,
  cargo: palletTarget.cargo,
  result: {
    placements: Array.from({ length: 40 }, (_, index) => ({
      cargoId: 'A',
      x: (index % 10) * 0.5,
      y: Math.floor(index / 10) * 0.4,
      z: 0,
      length: 0.5,
      width: 0.4,
      height: 0.3,
      weightKg: 10,
    })),
    remaining: [],
    loadedWeightKg: 400,
    usedVolumeM3: 2.4,
    validationIssues: [],
  },
};

describe('inertia certification', () => {
  it('requires both movement and tilt to stay inside the stable threshold', () => {
    expect(isInertiaStable(animation(0.012, 1.8))).toBe(true);
    expect(isInertiaStable(animation(0.0121, 1.8))).toBe(false);
    expect(isInertiaStable(animation(0.012, 1.81))).toBe(false);
  });

  it('separately rejects excessive cargo-on-pallet slip', () => {
    expect(isInertiaStable(animation(0.006, 0.9, { maxCargoRelativeSlipM: 0.007, maxSupportShiftM: 0.005 }), 'pallets')).toBe(true);
    expect(isInertiaStable(animation(0.006, 0.9, { maxCargoRelativeSlipM: 0.0081, maxSupportShiftM: 0.005 }), 'pallets')).toBe(false);
  });

  it('separately rejects excessive pallet movement', () => {
    expect(isInertiaStable(animation(0.006, 0.9, { maxCargoRelativeSlipM: 0.004, maxSupportShiftM: 0.0121 }), 'pallets')).toBe(false);
  });

  it('adds banding, corner guards and anti-slip material for pallet reinforcement', () => {
    const usage = buildSecuringUsage(palletTarget, 1);
    expect(usage.palletCount).toBe(2);
    expect(usage.bandingStraps).toBe(4);
    expect(usage.cornerGuards).toBe(8);
    expect(usage.antiSlipMats).toBe(2);
    expect(usage.dunnageBlocks).toBe(0);
    expect(usage.bandingLengthM).toBeGreaterThan(0);
    expect(usage.cornerGuardLengthM).toBeCloseTo(3.6, 5);
    expect(usage.estimatedNonCargoWeightKg).toBeGreaterThan(50);
  });

  it('increases wrapping length from actual pallet load height at level 2', () => {
    const usage = buildSecuringUsage(palletTarget, 2);
    expect(usage.bandingStraps).toBe(6);
    expect(usage.wrappingLengthM).toBeGreaterThan(0);
    expect(usage.cornerGuardLengthM).toBeCloseTo(3.6, 5);
  });

  it('does not invent stronger pallet-floor restraint when level 2 only adds wrap', () => {
    const level1 = securingProfileForUsage('pallets', buildSecuringUsage(palletTarget, 1));
    const level2 = securingProfileForUsage('pallets', buildSecuringUsage(palletTarget, 2));
    const level3 = securingProfileForUsage('pallets', buildSecuringUsage(palletTarget, 3));
    expect(level2.cargoRestraint!.maxAccelerationG).toBeGreaterThan(level1.cargoRestraint!.maxAccelerationG);
    expect(level1.supportRestraint).toBeUndefined();
    expect(level2.supportRestraint).toBeUndefined();
    expect(level3.supportRestraint).toBeUndefined();
  });

  it('derives pallet cargo restraint from straps and wrap without unverified container anchors', () => {
    const usage1 = buildSecuringUsage(palletTarget, 1);
    const usage2 = buildSecuringUsage(palletTarget, 2);
    const usage3 = buildSecuringUsage(palletTarget, 3);
    const profile1 = securingProfileForUsage('pallets', usage1);
    const profile2 = securingProfileForUsage('pallets', usage2);
    const profile3 = securingProfileForUsage('pallets', usage3);

    expect(profile1.cargoRestraint).toBeDefined();
    expect(profile2.cargoRestraint?.maxAccelerationG).toBeGreaterThan(profile1.cargoRestraint?.maxAccelerationG ?? 0);
    expect(profile1.supportRestraint).toBeUndefined();
    expect(profile2.supportRestraint).toBeUndefined();
    expect(profile3.supportRestraint).toBeUndefined();
    expect(usage3.loadBars).toBe(0);
    expect(profile3.frictionCoefficient).toBeGreaterThan(profile2.frictionCoefficient ?? 0);
  });

  it('uses blocking materials instead of pallet banding for direct-box reinforcement', () => {
    const usage = buildSecuringUsage(boxTarget, 2);
    expect(usage.palletCount).toBe(0);
    expect(usage.bandingStraps).toBe(0);
    expect(usage.cornerGuards).toBe(0);
    expect(usage.cornerGuardLengthM).toBe(0);
    expect(usage.dunnageBlocks).toBeGreaterThanOrEqual(4);
    expect(usage.loadBars).toBe(0);
    expect(usage.antiSlipMats).toBeGreaterThanOrEqual(2);
    expect(securingProfileForUsage('boxes', usage).cargoRestraint).toBeDefined();
  });

  it('escalates the simulated restraint as the securing level increases', () => {
    const base = securingProfileForUsage('pallets', buildSecuringUsage(palletTarget, 0));
    const max = securingProfileForUsage('pallets', buildSecuringUsage(palletTarget, 3));
    expect(max.cargoRestraint!.maxAccelerationG).toBeGreaterThan(base.cargoRestraint?.maxAccelerationG ?? 0);
    expect(base.supportRestraint).toBeUndefined();
    expect(max.supportRestraint).toBeUndefined();
    expect(max.frictionCoefficient).toBeGreaterThan(base.frictionCoefficient ?? 0);
  });

  it('changes target signature when a placement changes', () => {
    const first = createPhysicsTargetSignature(boxTarget);
    const moved: PhysicsTarget = {
      ...boxTarget,
      result: {
        ...boxTarget.result,
        placements: boxTarget.result.placements.map((item, index) => index === 0 ? { ...item, x: item.x + 0.1 } : item),
      },
    };
    expect(createPhysicsTargetSignature(moved)).not.toBe(first);
  });
});
