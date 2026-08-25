import { describe, expect, it } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsTarget } from './physicsTarget';
import { buildSecuringUsage, isInertiaStable, securingProfileForLevel } from './inertiaCertification';

function animation(shift: number, tilt: number): InertiaAnimationResult {
  return {
    scenario: 'braking',
    fps: 30,
    simulatedSeconds: 4,
    cargoCount: 1,
    supportCount: 1,
    frames: [],
    maxHorizontalShiftM: shift,
    maxTiltDeg: tilt,
  };
}

const palletTarget: PhysicsTarget = {
  mode: 'pallets',
  container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
  cargo: [{ id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1 }],
  result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.4, height: 0.3, weightKg: 10 }],
    remaining: [],
    loadedWeightKg: 35,
    usedVolumeM3: 0.06,
    validationIssues: [],
  },
  supports: [
    { id: 'P1', x: 0, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
    { id: 'P2', x: 1.1, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25, dynamic: true },
  ],
};

describe('inertia certification', () => {
  it('requires both movement and tilt to stay inside the stable threshold', () => {
    expect(isInertiaStable(animation(0.012, 1.8))).toBe(true);
    expect(isInertiaStable(animation(0.0121, 1.8))).toBe(false);
    expect(isInertiaStable(animation(0.012, 1.81))).toBe(false);
  });

  it('adds banding, corner guards and anti-slip material for pallet reinforcement', () => {
    const usage = buildSecuringUsage(palletTarget, 1);
    expect(usage.palletCount).toBe(2);
    expect(usage.bandingStraps).toBe(4);
    expect(usage.cornerGuards).toBe(8);
    expect(usage.antiSlipMats).toBe(2);
    expect(usage.estimatedNonCargoWeightKg).toBeGreaterThan(50);
  });

  it('escalates the simulated restraint as the securing level increases', () => {
    const base = securingProfileForLevel('pallets', 0);
    const max = securingProfileForLevel('pallets', 3);
    expect(max.cargoRetentionRatio).toBeGreaterThan(base.cargoRetentionRatio ?? 0);
    expect(max.supportRetentionRatio).toBeGreaterThan(base.supportRetentionRatio ?? 0);
    expect(max.frictionCoefficient).toBeGreaterThan(base.frictionCoefficient ?? 0);
  });
});
