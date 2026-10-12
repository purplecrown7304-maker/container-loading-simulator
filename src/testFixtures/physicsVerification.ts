import { createSecuredPhysicsSignature } from '../securedPhysicsCertification';
import type { PhysicsValidationSuite } from '../engine/physicsValidation';
import { buildInertiaSimulationSupports, createPhysicsTargetSignature, securingProfileForUsage, type InertiaCertification } from '../inertiaCertification';
import type { PhysicsTarget } from '../physicsTarget';

/** Complete deterministic test evidence; never substitute for a real production run. */
export function stablePhysicsFixture(target: PhysicsTarget): PhysicsValidationSuite {
  const motion = { severity: 'stable' as const, horizontalShiftM: 0, verticalShiftM: 0, tiltDeg: 0, linearSpeedMps: 0, angularSpeedRadps: 0, outOfBounds: false, reason: 'stable fixture' };
  const base = {
    engine: 'Rapier 3D' as const, score: 100, settled: true,
    stableCount: target.result.placements.length, warningCount: 0, unstableCount: 0,
    supportStableCount: target.supports?.length ?? 0, supportWarningCount: 0, supportUnstableCount: 0,
    maxHorizontalShiftM: 0, maxVerticalShiftM: 0, maxTiltDeg: 0, maxLinearSpeedMps: 0, maxAngularSpeedRadps: 0,
    placements: target.result.placements.map((item, index) => ({ ...motion, index, cargoId: item.cargoId })),
    supports: (target.supports ?? []).map((item, index) => ({ ...motion, index, id: item.id })),
    summary: 'stable fixture',
  };
  return { ...base, worstScenario: 'settle', scenarios: ['settle', 'acceleration', 'braking', 'cornering'].map(scenario => ({
    ...structuredClone(base), scenario: scenario as 'settle' | 'acceleration' | 'braking' | 'cornering',
    simulatedCount: target.result.placements.length, supportCount: target.supports?.length ?? 0, steps: 240, simulatedSeconds: 4,
  })) };
}

type State = Window & { __containerLoadingFinalPhysicsSignature?: string; __containerLoadingFinalPhysicsResult?: PhysicsValidationSuite };
export function publishPhysicsFixture(target: PhysicsTarget, result = stablePhysicsFixture(target)) {
  const state = window as State;
  state.__containerLoadingFinalPhysicsSignature = createPhysicsTargetSignature(target);
  state.__containerLoadingFinalPhysicsResult = result;
  return result;
}
export function clearPhysicsFixture() {
  delete (window as State).__containerLoadingFinalPhysicsSignature;
  delete (window as State).__containerLoadingFinalPhysicsResult;
}

export function withSecuredPhysicsFixture(target: PhysicsTarget, certification: InertiaCertification): InertiaCertification {
  const physics = stablePhysicsFixture({ ...target, supports: buildInertiaSimulationSupports(target, certification.securing) });
  physics.securingProfile = securingProfileForUsage(target.mode, certification.securing);
  for (const row of physics.scenarios) row.securingProfile = structuredClone(physics.securingProfile);
  return Object.assign(certification, { physicsValidation: physics,
    physicsValidationSignature: createSecuredPhysicsSignature(target, certification.securing) });
}
