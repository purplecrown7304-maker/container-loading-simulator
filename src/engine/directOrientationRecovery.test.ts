import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { auditLoading } from './loadingAudit';
import { heavyInnerOrderViolations } from './heavyInnerPolicy';
import { fixedGapSupports } from './gapSecuring';
import { buildDirectReoptimizationCargoProfiles, buildDirectResultReoptimizationCandidatesAsync } from './finalResultOptimization';
import { runInertiaCertification, INERTIA_PASS_SHIFT_M, INERTIA_PASS_TILT_DEG } from '../inertiaCertification';
import { isPhysicsTargetVerified } from '../inertiaWorkOrderPolicy';
import type { PhysicsTarget } from '../physicsTarget';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 2.83, width: 1.67, height: 1.58, maxPayloadKg: 1000,
  floorLoadLimitKgPerM2: 220, floorLoadWarningMultiplier: 3,
  unloadingPolicy: 'strict', ceilingClearanceM: 0.05,
};
const full: CargoItem = {
  id: 'PKG-GST-002', name: 'GST-002', length: .23500000000000001, width: .13, height: .265,
  weightKg: 1.42, quantity: 73, maxTopLoadKg: 34.3, allowRotation: true,
};
const cargo: CargoItem[] = [full, { ...full, id: 'PKG-GST-002-PARTIAL', weightKg: .7399999999999999, quantity: 1 }];
const target = (): PhysicsTarget => ({ mode: 'boxes', container, cargo,
  result: loadContainer(container, cargo, { strategy: 'capacity', publish: false }) });

describe('1-ton truck direct-box orientation recovery', () => {
  it('recovers all 74 cartons through allowed floor orientation and full peak/final verification', async () => {
    const current = target();
    expect(current.result.placements).toHaveLength(74);
    expect(current.result.placements.every(p => p.rotated)).toBe(true);
    const failed = await runInertiaCertification(current);
    expect(failed.status).toBe('failed');
    expect(failed.failedScenarios).toContain('braking');
    expect(failed.maxTiltDeg).toBeGreaterThan(INERTIA_PASS_TILT_DEG);
    expect(isPhysicsTargetVerified(current, failed)).toBe(false);

    const progress: number[] = [];
    const recovered = await buildDirectResultReoptimizationCandidatesAsync(current, 6, () => false, {
      strategy: 'capacity', onProgress: p => progress.push(p.total),
    });
    expect(recovered.timedOut).toBe(false);
    expect(progress.every(total => total <= 6)).toBe(true);
    const candidate = recovered.candidates.find(c => c.result.placements.every(p => !p.rotated));
    expect(candidate).toBeDefined();
    const next = candidate!.target;
    expect(next.cargo).toBe(current.cargo);
    expect(next.container).toBe(current.container);
    expect(next.result.placements).toHaveLength(74);
    expect(next.result.remaining).toEqual([]);
    expect(next.result.loadedWeightKg).toBeCloseTo(104.4);
    expect(auditLoading(container, cargo, next.result.placements)).toEqual([]);
    expect(heavyInnerOrderViolations(container, cargo, next.result.placements, 'capacity')).toBe(0);
    // No invented small-truck load bar: preserve the out-of-range gap and its warning.
    const door = next.result.voidFillPlan!.fills.find(fill => fill.kind === 'door-face')!;
    expect(door.material).toBe('unresolved');
    expect(door.fixedSupportEligible).toBe(false);
    expect(fixedGapSupports(next.result.voidFillPlan!).some(s => s.id === door.id)).toBe(false);
    expect(next.result.operationalFindings?.some(f => f.code === 'VOID_FILL_REQUIRED')).toBe(true);

    const certification = await runInertiaCertification(next);
    expect(certification.status).toBe('passed');
    expect(certification.securing.level).toBe(1);
    expect(certification.securing.loadBars).toBe(0);
    expect(certification.passedScenarios).toBe(3);
    expect(certification.failedScenarios).toEqual([]);
    expect(certification.maxHorizontalShiftM).toBeLessThanOrEqual(INERTIA_PASS_SHIFT_M);
    expect(certification.maxTiltDeg).toBeLessThanOrEqual(INERTIA_PASS_TILT_DEG);
    expect(certification.physicsValidation?.scenarios).toHaveLength(4);
    expect(certification.physicsValidation?.unstableCount).toBe(0);
    expect(isPhysicsTargetVerified(next, certification)).toBe(true);
  }, 30_000);

  it('never changes user-restricted orientations or other constraints in recovery profiles', () => {
    const current = target();
    const inputs: CargoItem[] = [
      full,
      { ...full, id: 'fixed', allowRotation: false },
      { ...full, id: 'only-normal', allowedOrientations: ['LWH'] },
      { ...full, id: 'only-rotated', allowedOrientations: ['WLH'] },
      { ...full, id: 'side-only', allowedOrientations: ['HLW'] },
    ];
    const before = structuredClone(inputs);
    const profiles = buildDirectReoptimizationCargoProfiles({ ...current, cargo: inputs });
    const orientations = profiles.filter(p => p.kind === 'orientation');
    expect(orientations).toHaveLength(2);
    for (const profile of orientations) {
      expect(profile.cargo.slice(1)).toEqual(inputs.slice(1));
      expect(profile.cargo[0]).toEqual({ ...full, allowedOrientations: profile.cargo[0].allowedOrientations });
      expect(profile.cargo[0].allowedOrientations).toHaveLength(1);
      expect(['LWH', 'WLH']).toContain(profile.cargo[0].allowedOrientations![0]);
    }
    expect(inputs).toEqual(before);
    expect(buildDirectReoptimizationCargoProfiles({ ...current, cargo: inputs.slice(1) }).some(p => p.kind === 'orientation')).toBe(false);
    expect(buildDirectReoptimizationCargoProfiles({ ...current, mode: 'pallets' })).toEqual([]);
    expect(buildDirectReoptimizationCargoProfiles({ ...current, container: { ...container,
      rules: { version: 'a-v1', equipmentId: 'custom', kind: 'container', access: ['rear'], source: 'test' },
    } }).some(p => p.kind === 'orientation')).toBe(false);
  });
});
