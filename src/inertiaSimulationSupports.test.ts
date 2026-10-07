import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedGapSupports, gapSecuringPlan } from './engine/gapSecuring';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import { buildInertiaSimulationSupports, buildSecuringUsage, runInertiaCertification } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  completeCertificationForWorkOrder,
  isInertiaCertificationPassed,
  isPhysicsTargetVerified,
} from './inertiaWorkOrderPolicy';
import type { PhysicsTarget } from './physicsTarget';
import { defaultSecuringMaterialSettings, writeSecuringMaterialSettings } from './securingMaterialSettings';

vi.mock('./engine/inertiaSimulation', () => ({ runInertiaAnimation: vi.fn() }));

function target(): PhysicsTarget {
  return {
    mode: 'boxes',
    container: { length: 4, width: 2.35, height: 2, maxPayloadKg: 2000 },
    cargo: [{ id: 'BOX', name: 'BOX', length: 0.6, width: 1.55, height: 0.8, weightKg: 120, quantity: 1 }],
    result: {
      placements: [{ cargoId: 'BOX', x: 0, y: 0.2, z: 0, length: 0.6, width: 1.55, height: 0.8, weightKg: 120 }],
      loadedWeightKg: 120,
      usedVolumeM3: 0.744,
      remaining: [],
      validationIssues: [],
    },
    supports: [{ id: 'existing-support', x: 3, y: 0, z: 0, length: 0.2, width: 2.35, height: 0.1, weightKg: 10, dynamic: true }],
  };
}

function mockSimulation(brakingShiftM = 0.02) {
  vi.mocked(runInertiaAnimation).mockImplementation(async (_container, placements, scenario, supports) => ({
    scenario,
    fps: 30,
    simulatedSeconds: 4,
    cargoCount: placements.length,
    supportCount: supports?.length ?? 0,
    frames: [],
    maxHorizontalShiftM: scenario === 'braking' ? brakingShiftM : 0.005,
    maxTiltDeg: 0.5,
  }));
}

beforeEach(() => {
  localStorage.clear();
  mockSimulation();
});

afterEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('shared inertia simulation supports', () => {
  it('completes a missing scenario with the initial support geometry and saved material settings', async () => {
    const current = target();
    const originalSupports = structuredClone(current.supports);
    const initial = await runInertiaCertification(current);
    expect(initial.securing.level).toBe(3);
    expect(initial.testedScenarios).toBe(2);
    expect(initial.results.cornering).toBeUndefined();
    expect(runInertiaAnimation).toHaveBeenCalledTimes(6);

    const plan = gapSecuringPlan(current.container, current.result.placements, initial.securing.materialUnitWeights);
    expect(plan.fills.filter(fill => fill.fixedSupportEligible).map(fill => fill.kind)).toEqual(['side-gap', 'door-face']);
    const unresolved = plan.fills.filter(fill => !fill.fixedSupportEligible);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ kind: 'side-gap', material: 'unresolved' });
    const expectedSupports = [...originalSupports!, ...fixedGapSupports(plan)];
    for (const call of vi.mocked(runInertiaAnimation).mock.calls) {
      expect(call[3]).toEqual(expectedSupports);
      expect(call[3]?.[0]).toBe(current.supports![0]);
      expect(call[3]?.some(support => support.id === unresolved[0].id)).toBe(false);
    }

    // A settings edit would resolve the old 0.6 m gap, reject the old 0.2 m gap,
    // change airbag weight and remove the door bar if completion re-read settings.
    writeSecuringMaterialSettings({
      ...defaultSecuringMaterialSettings,
      voidAirBagMinGapM: 0.3,
      voidAirBagMaxGapM: 0.8,
      voidAirBagKgPerEa: 9,
      voidDoorBarMinSpanM: 3,
    });
    expect(fixedGapSupports(gapSecuringPlan(current.container, current.result.placements))).not.toEqual(fixedGapSupports(plan));

    const completed = await completeCertificationForWorkOrder(current, initial);
    const completionCall = vi.mocked(runInertiaAnimation).mock.calls[6];
    expect(completionCall[2]).toBe('cornering');
    expect(completionCall[3]).toEqual(expectedSupports);
    expect(completionCall[5]).toEqual(vi.mocked(runInertiaAnimation).mock.calls[5][5]);
    expect(completed.securing).toBe(initial.securing);
    expect(completed.results.acceleration).toBe(initial.results.acceleration);
    expect(completed.results.braking).toBe(initial.results.braking);
    expect(completed.testedScenarios).toBe(3);
    expect(completed.status).toBe('failed');
    expect(completed.failedScenarios).toEqual(['braking']);
    expect(assessWorkOrderCertification(completed)).toBe('caution');
    expect(isInertiaCertificationPassed(completed)).toBe(false);

    // Reusing a partial snapshot must not append fills into the target or accumulate them.
    await completeCertificationForWorkOrder(current, initial);
    expect(vi.mocked(runInertiaAnimation).mock.calls[7][3]).toEqual(expectedSupports);
    expect(current.supports).toEqual(originalSupports);
    expect(buildInertiaSimulationSupports(current, initial.securing)).toEqual(expectedSupports);
  });

  it.each(['pallets', 'A-rules', 'rigid-pallet cargo', 'MIXED provenance'] as const)(
    'leaves %s support inputs unchanged in both paths',
    async kind => {
      const current = target();
      if (kind === 'pallets') current.mode = 'pallets';
      if (kind === 'A-rules') current.container.rules = { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], source: 'test' };
      if (kind === 'rigid-pallet cargo') current.cargo[0].unitKind = 'pallet';
      if (kind === 'MIXED provenance') current.cargo[0].sourcePalletIndex = 0;

      // This geometry would otherwise receive eligible gap supports.
      expect(fixedGapSupports(gapSecuringPlan(current.container, current.result.placements)).length).toBeGreaterThan(0);
      const initial = await runInertiaCertification(current);
      await completeCertificationForWorkOrder(current, initial);
      expect(runInertiaAnimation).toHaveBeenCalledTimes(7);
      for (const call of vi.mocked(runInertiaAnimation).mock.calls) expect(call[3]).toBe(current.supports);
    },
  );

  it.each([['failed', 0.02], ['review', 0.005]] as const)('keeps a completed numerical review %s without promoting it to dispatch PASS', async (status, brakingShiftM) => {
    mockSimulation(brakingShiftM);
    const current = target();
    current.container.limitReview = { mode: 'what-if', maxPayloadKg: 2100 };
    const securing = buildSecuringUsage(current, 1);
    const initial = await runInertiaCertification(current);
    const partial = { ...initial, results: { acceleration: initial.results.acceleration }, testedScenarios: 1 };
    vi.mocked(runInertiaAnimation).mockClear();

    const completed = await completeCertificationForWorkOrder(current, partial);
    expect(runInertiaAnimation).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(runInertiaAnimation).mock.calls) {
      expect(call[3]).toEqual(buildInertiaSimulationSupports(current, securing));
    }
    expect(completed.limitReview).toEqual(current.container.limitReview);
    expect(completed.status).toBe(status);
    expect(completed.failedScenarios).toEqual(status === 'failed' ? ['braking'] : []);
    expect(isInertiaCertificationPassed(completed)).toBe(false);
    expect(isPhysicsTargetVerified(current, completed)).toBe(false);
  });
});
