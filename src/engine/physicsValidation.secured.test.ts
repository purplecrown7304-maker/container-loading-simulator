import { describe, expect, it } from 'vitest';
import { runInertiaAnimation } from './inertiaSimulation';
import { combinePhysicsValidationResults, describePhysicsMotion, isCompleteSecuredPhysicsDuration, isPhysicsMotionSettled, runPhysicsValidation, runPhysicsValidationSuite, type PhysicsSupport } from './physicsValidation';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 3, width: 2.4, height: 2.4, maxPayloadKg: 28000 };
const pallet: PhysicsSupport = { id: 'PALLET-01', x: 0.5, y: 0.5, z: 0, length: 1.1, width: 1.1, height: 0.12, weightKg: 6, dynamic: true };
const securing = {
  frictionCoefficient: 0.82,
  cargoRestraint: { springAccelerationPerM: 33, dampingPerSecond: 7.7, maxAccelerationG: 0.58 },
};
const cartons: Placement[] = [];
for (let layer = 0; layer < 2; layer += 1) {
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 8; iy += 1) {
      cartons.push({ cargoId: 'BOX', x: 0.58 + ix * 0.235, y: 0.53 + iy * 0.13, z: 0.12 + layer * 0.265, length: 0.235, width: 0.13, height: 0.265, weightKg: 16 });
    }
  }
}

describe('same-configuration secured physics validation', () => {
  it.each([[0, 0], [1, 240], [199, 240], [200, 210], [399, 210], [400, 180], [699, 180], [700, 150]])(
    'requires the complete deterministic simulation duration for %i bodies', (count, steps) => {
      expect(isCompleteSecuredPhysicsDuration(count, steps, steps / 60)).toBe(true);
      expect(isCompleteSecuredPhysicsDuration(count, steps + 1, steps / 60)).toBe(false);
      expect(isCompleteSecuredPhysicsDuration(count, steps, steps / 60 + 0.1)).toBe(false);
    },
  );

  it('shares the live motion classifier and finite settled criteria with stored-evidence validation', () => {
    const motion = { horizontalShiftM: 0, verticalShiftM: 0.1, tiltDeg: 0, linearSpeedMps: 0, angularSpeedRadps: 0, outOfBounds: false };
    expect(describePhysicsMotion(motion).severity).toBe('unstable');
    expect(isPhysicsMotionSettled(0.05, 0.08)).toBe(true);
    expect(isPhysicsMotionSettled(0.050001, 0.08)).toBe(false);
    expect(isPhysicsMotionSettled(0.05, 0.080001)).toBe(false);
    expect(isPhysicsMotionSettled(NaN, 0)).toBe(false);
    expect(isCompleteSecuredPhysicsDuration(NaN, 0, 0)).toBe(false);
  });

  it('retains the unsecured baseline and validates the selected compound unit in the inertia world', async () => {
    const baseline = await runPhysicsValidation(container, cartons, undefined, 'settle', [pallet]);
    const secured = await runPhysicsValidationSuite(container, cartons, undefined, [pallet], undefined, securing);
    expect(baseline.securingProfile).toBeUndefined();
    // The 6 kg loose base below 1,024 kg of independent cartons exposes the numerical
    // floor-penetration artefact. Do not hide it by increasing the boundary tolerance.
    expect(baseline.supportUnstableCount).toBe(1);
    expect(baseline.supports[0].outOfBounds).toBe(true);
    expect(secured.securingProfile).toEqual(securing);
    expect(secured.scenarios).toHaveLength(4);
    expect(secured.scenarios.every(result => result.securingProfile === securing)).toBe(true);
    expect(secured.supportUnstableCount).toBe(0);
    expect(secured.unstableCount).toBe(0);
    expect(secured.settled).toBe(true);
    expect(secured.score).toBe(100);
    expect(secured.maxVerticalShiftM).toBeLessThan(0.015);
  });

  it('does not treat securing as permission to ignore real floor penetration', async () => {
    const belowFloor = { ...pallet, z: -0.05, dynamic: false };
    const result = await runPhysicsValidation(container, [], undefined, 'settle', [belowFloor], securing);
    expect(result.supportUnstableCount).toBe(1);
    expect(result.supports[0].outOfBounds).toBe(true);
    expect(result.supports[0].reason).toContain('경계 이탈');
  });

  it('still detects unsupported cartons falling under the selected securing profile', async () => {
    const floating = { ...cartons[0], z: 0.9 };
    const result = await runPhysicsValidation(container, [floating], undefined, 'settle', [], securing);
    expect(result.unstableCount).toBe(1);
    expect(result.placements[0].verticalShiftM).toBeLessThan(-0.5);
    expect(result.placements[0].reason).toContain('높이 변화');
  });

  it('returns detached finite final motion without animation frames or live physics handles', async () => {
    const result = await runInertiaAnimation(container, cartons, 'braking', [pallet], undefined, securing,
      { captureFrames: false, captureFinalMotion: true });
    expect(result.frames).toEqual([]);
    expect(result.finalMotion?.cargo).toHaveLength(cartons.length);
    expect(result.finalMotion?.supports).toHaveLength(1);
    const clone = structuredClone(result.finalMotion!);
    for (const motion of [...clone.cargo, ...clone.supports]) {
      expect(Object.values(motion).flatMap(Object.values).every(Number.isFinite)).toBe(true);
    }
  });

  it('rejects mixed configuration aggregation and cancels before publishing a partial secured result', async () => {
    const raw = await runPhysicsValidation(container, [], undefined, 'settle');
    const secured = await runPhysicsValidation(container, [], undefined, 'settle', [], securing);
    expect(() => combinePhysicsValidationResults([], [], [raw, secured])).toThrow('PHYSICS_CONFIGURATION_MISMATCH');
    await expect(runPhysicsValidation(container, cartons, undefined, 'braking', [pallet], securing, () => true)).rejects.toThrow('CANCELLED');
  });
});
