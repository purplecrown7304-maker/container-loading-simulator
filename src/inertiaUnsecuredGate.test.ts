import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsTarget } from './physicsTarget';
const animate = vi.hoisted(() => vi.fn());
vi.mock('./engine/inertiaSimulation', () => ({ runInertiaAnimation: animate }));
import { hasCompletedSecuringSequence, hasUnsecuredTransportPass, runInertiaCertification } from './inertiaCertification';
const target = (mode: PhysicsTarget['mode']): PhysicsTarget => ({
  mode, container: { length: 2, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: 1, width: 1, height: .2, weightKg: 10, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: mode === 'pallets' ? .15 : 0, length: 1, width: 1, height: .2, weightKg: 10 }], remaining: [], loadedWeightKg: mode === 'pallets' ? 35 : 10, usedVolumeM3: .2, validationIssues: [] },
  supports: mode === 'pallets' ? [{ id: 'P', x: 0, y: 0, z: 0, length: 1, width: 1, height: .15, weightKg: 25 }] : [],
});
const result = (scenario: InertiaAnimationResult['scenario'], shift = 0): InertiaAnimationResult => ({ scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: shift, maxTiltDeg: 0, maxCargoRelativeSlipM: shift, maxSupportShiftM: shift });
beforeEach(() => { localStorage.clear(); animate.mockReset(); animate.mockImplementation(async (_c, _p, scenario) => result(scenario)); });
describe('unsecured transport gate before finishing materials', () => {
  for (const mode of ['boxes', 'pallets'] as const) {
    for (const failing of ['acceleration', 'braking', 'cornering'] as const) {
      it(`${mode}: ${failing} failure cannot be rescued by materials`, async () => {
        animate.mockImplementation(async (_c, _p, scenario) => result(scenario, scenario === failing ? .05 : 0));
        const report = await runInertiaCertification(target(mode));
        expect(report.status).toBe('failed');
        expect(animate).toHaveBeenCalledTimes(3);
        expect(report.attempts?.map(a => a.level)).toEqual([0]);
        expect(report.attempts?.[0].scenarios).toHaveLength(3);
        expect(report.securing.estimatedAddedWeightKg).toBe(0);
        for (const call of animate.mock.calls) expect(call[5]).toEqual({ frictionCoefficient: .62 });
      });
    }
    it(`${mode}: all three unsecured passes precede a mandatory finished transport check`, async () => {
      const report = await runInertiaCertification(target(mode));
      expect(report.status).toBe('passed');
      expect(report.attempts?.map(a => a.level)).toEqual([0, 1]);
      expect(animate).toHaveBeenCalledTimes(6);
      expect(report.securing.level).toBe(1);
      expect(report.securing.estimatedAddedWeightKg).toBeGreaterThan(0);
      expect(animate.mock.calls.slice(0, 3).map(c => c[2])).toEqual(['acceleration', 'braking', 'cornering']);
    });
  }
  it('cannot approve unsecured success when finishing material exceeds payload', async () => {
    const input = target('boxes'); input.container.maxPayloadKg = input.result.loadedWeightKg;
    const report = await runInertiaCertification(input);
    expect(animate).toHaveBeenCalledTimes(3);
    expect(report.status).toBe('failed');
    expect(report.attempts?.map(a => [a.level, a.passed])).toEqual([[0, true], [1, false]]);
    expect(report.payloadWithinLimit).toBe(false);
  });
  it('cannot approve unsecured success when every finished level fails', async () => {
    animate.mockImplementation(async (_c, _p, scenario, _s, _progress, profile) => result(scenario, profile.cargoRestraint ? .05 : 0));
    const report = await runInertiaCertification(target('boxes'));
    expect(report.status).toBe('failed');
    expect(report.attempts?.map(a => a.level)).toEqual([0, 1, 2, 3]);
  });
  it('cancels between unsecured and finished stages without running materials', async () => {
    await expect(runInertiaCertification(target('boxes'), undefined, undefined, () => animate.mock.calls.length >= 3)).rejects.toThrow('INERTIA_CERTIFICATION_CANCELLED');
    expect(animate).toHaveBeenCalledTimes(3);
  });
  it('rejects old, incomplete, duplicate, or numerically invalid proof', async () => {
    const report = await runInertiaCertification(target('pallets'));
    expect(hasCompletedSecuringSequence(report)).toBe(true);
    expect(hasCompletedSecuringSequence({ ...report, results: {} })).toBe(false);
    expect(hasCompletedSecuringSequence({ ...report, testedScenarios: 0 })).toBe(false);
    expect(hasCompletedSecuringSequence({ ...report, failedScenarios: ['braking'] })).toBe(false);
    expect(hasUnsecuredTransportPass(undefined)).toBe(false);
    expect(hasCompletedSecuringSequence({ ...report, attempts: undefined })).toBe(false);
    expect(hasCompletedSecuringSequence({ ...report, attempts: report.attempts?.slice(1) })).toBe(false);
    const duplicate = structuredClone(report);
    duplicate.attempts![0].scenarios[2] = duplicate.attempts![0].scenarios[0];
    expect(hasCompletedSecuringSequence(duplicate)).toBe(false);
    const missingPhase = structuredClone(report); delete missingPhase.attempts![0].phase;
    expect(hasCompletedSecuringSequence(missingPhase)).toBe(false);
    const nan = structuredClone(report); nan.attempts![0].scenarios[0].maxTiltDeg = NaN;
    expect(hasCompletedSecuringSequence(nan)).toBe(false);
    const slipping = structuredClone(report); slipping.attempts![0].scenarios[0].maxCargoRelativeSlipM = .009;
    expect(hasCompletedSecuringSequence(slipping)).toBe(false);
  });
  it('rejects an empty target without treating three empty simulations as proof', async () => {
    const input = target('boxes'); input.result.placements = [];
    const report = await runInertiaCertification(input);
    expect(report.status).toBe('failed');
    expect(animate).not.toHaveBeenCalled();
    expect(hasCompletedSecuringSequence(report)).toBe(false);
  });

});
