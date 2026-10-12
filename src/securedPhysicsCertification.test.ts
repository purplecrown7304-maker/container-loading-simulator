import { afterEach, expect, it, vi } from 'vitest';
import { completeSecuredPhysicsValidation, createSecuredPhysicsSignature } from './securedPhysicsCertification';
import { buildInertiaSimulationSupports, buildSecuringUsage, createPhysicsTargetSignature, securingProfileForUsage, type InertiaCertification } from './inertiaCertification';
import { runPhysicsValidationSuiteParallel } from './physicsParallel';
import type { PhysicsTarget } from './physicsTarget';
import { stablePhysicsFixture } from './testFixtures/physicsVerification';
vi.mock('./physicsParallel', () => ({ runPhysicsValidationSuiteParallel: vi.fn() }));
const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] } };
const certification = (): InertiaCertification => ({ status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 3), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .001, maxTiltDeg: .1, results: {} });
afterEach(() => vi.clearAllMocks());
it('runs the full suite with exact selected materials/supports and binds the evidence before returning', async () => {
  const cert = certification();
  const result = { ...stablePhysicsFixture(target), securingProfile: securingProfileForUsage(target.mode, cert.securing) };
  vi.mocked(runPhysicsValidationSuiteParallel).mockResolvedValue(result);
  const completed = await completeSecuredPhysicsValidation(target, cert);
  expect(runPhysicsValidationSuiteParallel).toHaveBeenCalledWith(target.container, target.result.placements, expect.any(Function), buildInertiaSimulationSupports(target, cert.securing), expect.any(AbortSignal), result.securingProfile);
  expect(completed.physicsValidation).toBe(result);
  expect(completed.physicsValidationSignature).toBe(createSecuredPhysicsSignature(target, cert.securing));
  expect(cert.physicsValidation).toBeUndefined();
  expect(await completeSecuredPhysicsValidation(target, completed)).toBe(completed);
  expect(runPhysicsValidationSuiteParallel).toHaveBeenCalledOnce();
  await completeSecuredPhysicsValidation(target, { ...completed, securing: { ...completed.securing, loadBars: 9 } });
  expect(runPhysicsValidationSuiteParallel).toHaveBeenCalledTimes(2);
});
it('never publishes a late secured validation after cancellation', async () => {
  let cancelled = false;
  const cert = certification();
  vi.mocked(runPhysicsValidationSuiteParallel).mockImplementation(async () => { cancelled = true; return stablePhysicsFixture(target); });
  await expect(completeSecuredPhysicsValidation(target, cert, undefined, () => cancelled)).rejects.toThrow('CANCELLED');
  expect(cert.physicsValidation).toBeUndefined();
});
it('does not fabricate secured evidence for an incomplete or payload-invalid run', async () => {
  for (const overrides of [{ testedScenarios: 2 }, { payloadWithinLimit: false }]) {
    const cert = { ...certification(), ...overrides };
    expect(await completeSecuredPhysicsValidation(target, cert)).toBe(cert);
    expect(cert.physicsValidation).toBeUndefined();
  }
  expect(runPhysicsValidationSuiteParallel).not.toHaveBeenCalled();
});
