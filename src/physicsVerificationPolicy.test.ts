import { afterEach, describe, expect, it } from 'vitest';
import { assessPhysicsVerification } from './physicsVerificationPolicy';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { isPhysicsTargetVerified, workOrderTargetApprovalLabel } from './inertiaWorkOrderPolicy';
import { certificationVerificationState } from './workflowVerificationState';
import type { PhysicsTarget } from './physicsTarget';
import { clearPhysicsFixture, publishPhysicsFixture, withSecuredPhysicsFixture } from './testFixtures/physicsVerification';

const target: PhysicsTarget = { mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: .15, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] }, supports: [{ id: 'P1', x: 0, y: 0, z: 0, length: 1, width: 1, height: .15, weightKg: 6, dynamic: true }] };
function certification(): InertiaCertification {
  return withSecuredPhysicsFixture(target, { status: 'passed', mode: target.mode, targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 3), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .001, maxTiltDeg: .1, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 1, frames: [], maxHorizontalShiftM: .001, maxTiltDeg: .1, maxCargoRelativeSlipM: .001, maxSupportShiftM: .001 }])) });
}
afterEach(clearPhysicsFixture);

describe('exact secured physics acceptance and unrestrained baseline distinction', () => {
  it('requires same-configuration final evidence even when inertia claims PASS', () => {
    const cert = certification();
    delete cert.physicsValidation;
    expect(assessPhysicsVerification(target, cert).status).toBe('missing');
    expect(isPhysicsTargetVerified(target, cert)).toBe(false);
    expect(workOrderTargetApprovalLabel(target, cert)).toContain('물리검증 미완료');
    publishPhysicsFixture(target);
    expect(isPhysicsTargetVerified(target, cert)).toBe(false);
    withSecuredPhysicsFixture(target, cert);
    expect(isPhysicsTargetVerified(target, cert)).toBe(true);
    const changed = { ...target, result: { ...target.result, placements: [{ ...target.result.placements[0], x: .5 }] } };
    const matchingInertia = { ...cert, targetSignature: createPhysicsTargetSignature(changed) };
    expect(assessPhysicsVerification(changed, matchingInertia).status).toBe('stale');
    expect(isPhysicsTargetVerified(changed, matchingInertia)).toBe(false);
  });

  it.each(['scenario', 'nonfinite', 'counts', 'body', 'duplicate', 'missing-profile', 'different-profile', 'cargo-identity', 'support-identity', 'body-counts', 'null-body', 'null-scenario', 'vertical-severity', 'negative-speed', 'understated-speed', 'settled-flag', 'overstated-stable-metrics', 'truncated-time'])('fails closed for incomplete %s evidence', kind => {
    const cert = certification();
    const physics = cert.physicsValidation!;
    if (kind === 'overstated-stable-metrics') physics.scenarios[1].maxVerticalShiftM = 1;
    if (kind === 'truncated-time') physics.scenarios[1].steps = 1;
    if (kind === 'vertical-severity') physics.scenarios[1].placements[0].verticalShiftM = -1;
    if (kind === 'negative-speed') physics.scenarios[1].placements[0].linearSpeedMps = -.2;
    if (kind === 'understated-speed') { const row = physics.scenarios[1]; row.placements[0].linearSpeedMps = .2; row.placements[0].severity = 'warning'; row.stableCount = 0; row.warningCount = 1; }
    if (kind === 'settled-flag') physics.scenarios[1].maxLinearSpeedMps = .2;
    if (kind === 'null-body') physics.scenarios[1].placements[0] = null as never;
    if (kind === 'null-scenario') physics.scenarios[1] = null as never;
    if (kind === 'cargo-identity') physics.scenarios[1].placements[0].cargoId = 'OTHER';
    if (kind === 'support-identity') physics.scenarios[1].supports[0].id = 'OTHER';
    if (kind === 'body-counts') physics.scenarios[1].placements[0].severity = 'warning';
    if (kind === 'missing-profile') delete physics.scenarios[1].securingProfile;
    if (kind === 'different-profile') physics.scenarios[1].securingProfile = { frictionCoefficient: .99 };
    if (kind === 'scenario') physics.scenarios.pop();
    if (kind === 'nonfinite') physics.scenarios[1].maxTiltDeg = NaN;
    if (kind === 'counts') physics.scenarios[1].supportCount = 0;
    if (kind === 'body') physics.scenarios[1].placements = [];
    if (kind === 'duplicate') physics.scenarios[3].scenario = 'braking';
    expect(assessPhysicsVerification(target, cert).status).toBe('incomplete');
    expect(isPhysicsTargetVerified(target, cert)).toBe(false);
  });

  it.each(['cargo', 'support', 'residual'])('blocks actual gravity-settle %s failures despite secured inertia PASS', kind => {
    const cert = certification();
    const physics = cert.physicsValidation!;
    const settle = physics.scenarios[0];
    if (kind === 'cargo') { settle.stableCount = 0; settle.unstableCount = 1; settle.placements[0].severity = 'unstable'; settle.placements[0].outOfBounds = true; }
    if (kind === 'support') { settle.supportStableCount = 0; settle.supportUnstableCount = 1; settle.supports[0].severity = 'unstable'; settle.supports[0].outOfBounds = true; }
    if (kind === 'residual') { settle.settled = false; settle.maxLinearSpeedMps = .06; settle.placements[0].linearSpeedMps = .06; settle.placements[0].severity = 'warning'; settle.stableCount = 0; settle.warningCount = 1; }
    expect(assessPhysicsVerification(target, cert).status).toBe('failed');
    expect(isPhysicsTargetVerified(target, cert)).toBe(false);
    expect(workOrderTargetApprovalLabel(target, cert)).toBe('물리검증 실패 · 출고 차단');
    expect(certificationVerificationState(cert, target).reason).toContain('출고 승인은 차단');
  });

  it('retains unsecured braking failures separately from a complete secured strict PASS', () => {
    const baseline = publishPhysicsFixture(target);
    baseline.settled = false; baseline.stableCount = 0; baseline.unstableCount = 1; baseline.score = 5;
    const cert = certification();
    expect(isPhysicsTargetVerified(target, cert)).toBe(true);
    expect(workOrderTargetApprovalLabel(target, cert)).toBe('PASS');
    expect(baseline.unstableCount).toBe(1);
    const braking = cert.physicsValidation!.scenarios[2];
    braking.stableCount = 0; braking.unstableCount = 1; braking.settled = false;
    braking.placements[0].severity = 'unstable'; braking.placements[0].outOfBounds = true; braking.maxLinearSpeedMps = .06;
    expect(isPhysicsTargetVerified(target, cert)).toBe(false);
  });

  it('invalidates evidence when securing material quantities or the profile change', () => {
    const cert = certification();
    cert.securing.loadBars += 1;
    expect(assessPhysicsVerification(target, cert).status).toBe('stale');
    const other = certification();
    other.physicsValidation!.securingProfile = { frictionCoefficient: .99 };
    expect(assessPhysicsVerification(target, other).status).toBe('stale');
  });

  it('does not impose a new score cutoff for stable warning-only motion', () => {
    const cert = certification();
    const physics = cert.physicsValidation!;
    physics.score = 85; physics.stableCount = 0; physics.warningCount = 1; physics.placements[0].severity = 'warning'; physics.placements[0].horizontalShiftM = .02; physics.maxHorizontalShiftM = .02;
    expect(isPhysicsTargetVerified(target, cert)).toBe(true);
  });
});
