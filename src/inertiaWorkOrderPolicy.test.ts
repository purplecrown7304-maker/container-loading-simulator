import { describe, expect, it, vi } from 'vitest';
const animate = vi.hoisted(() => vi.fn());
vi.mock('./engine/inertiaSimulation', () => ({ runInertiaAnimation: animate }));
import type { PhysicsTarget } from './physicsTarget';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import { createPhysicsTargetSignature, type InertiaCertification, type InertiaScenario } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  completeCertificationForWorkOrder,
} from './inertiaWorkOrderPolicy';

const scenarios: InertiaScenario[] = ['acceleration', 'braking', 'cornering'];

function result(overrides: Partial<InertiaAnimationResult> = {}): InertiaAnimationResult {
  return {
    scenario: 'acceleration',
    fps: 30,
    simulatedSeconds: 4,
    cargoCount: 1,
    supportCount: 0,
    frames: [],
    maxHorizontalShiftM: 0.005,
    maxTiltDeg: 0.5,
    maxCargoRelativeSlipM: 0,
    maxSupportShiftM: 0,
    maxCargoRestraintForceN: 0,
    maxSupportRestraintForceN: 0,
    ...overrides,
  };
}

function certification(
  mode: 'boxes' | 'pallets',
  scenarioResults: Partial<Record<InertiaScenario, InertiaAnimationResult>>,
): InertiaCertification {
  const values = Object.values(scenarioResults).filter((item): item is InertiaAnimationResult => Boolean(item));
  return {
    status: values.length === 3 && values.every(item => item.maxHorizontalShiftM <= 0.012 && item.maxTiltDeg <= 1.8) ? 'passed' : 'failed',
    mode,
    targetSignature: 'test',
    testedAt: new Date(0).toISOString(),
    securing: {
      level: 3,
      levelLabel: 'test',
      palletCount: mode === 'pallets' ? 1 : 0,
      palletWeightKg: 0,
      bandingStraps: 0,
      bandingLengthM: 0,
      cornerGuards: 0,
      cornerGuardLengthM: 0,
      wrappingLengthM: 0,
      antiSlipMats: 0,
      dunnageBlocks: 0,
      loadBars: 0,
      estimatedAddedWeightKg: 0,
      estimatedNonCargoWeightKg: 0,
    },
    testedScenarios: values.length,
    passedScenarios: 0,
    failedScenarios: scenarios.filter(scenario => !scenarioResults[scenario]),
    maxHorizontalShiftM: values.reduce((max, item) => Math.max(max, item.maxHorizontalShiftM), 0),
    maxTiltDeg: values.reduce((max, item) => Math.max(max, item.maxTiltDeg), 0),
    maxCargoRelativeSlipM: values.reduce((max, item) => Math.max(max, item.maxCargoRelativeSlipM ?? 0), 0),
    maxSupportShiftM: values.reduce((max, item) => Math.max(max, item.maxSupportShiftM ?? 0), 0),
    results: scenarioResults,
    payloadWithinLimit: true,
    attempts: [{
      level: 0, phase: 'unsecured', levelLabel: 'baseline', payloadWithinLimit: true, passed: true,
      scenarios: scenarios.map(scenario => ({ scenario, passed: true, maxHorizontalShiftM: .005, maxTiltDeg: .5, maxCargoRelativeSlipM: 0, maxSupportShiftM: 0 })),
    }],
  };
}

function threeResults(overrides: Partial<InertiaAnimationResult> = {}) {
  return Object.fromEntries(scenarios.map(scenario => [scenario, result({ ...overrides, scenario })])) as Record<InertiaScenario, InertiaAnimationResult>;
}

describe('work order inertia warning policy', () => {
  it('allows a completed caution result that is above PASS but below danger', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.02 }));
    expect(assessWorkOrderCertification(cert)).toBe('caution');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('미끄럼방지재'))).toBe(true);
  });

  it('keeps danger classification but still allows a box work order', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.031 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('위험 기준'))).toBe(true);
  });

  it('keeps dangerous pallet-relative cargo slip visible without blocking output', () => {
    const cert = certification('pallets', threeResults({ maxHorizontalShiftM: 0.006, maxCargoRelativeSlipM: 0.021 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(true);
  });

  it('allows an incomplete result as a warning-grade work order', () => {
    const cert = certification('boxes', {
      acceleration: result({ scenario: 'acceleration', maxHorizontalShiftM: 0.02 }),
      braking: result({ scenario: 'braking', maxHorizontalShiftM: 0.01 }),
    });
    expect(assessWorkOrderCertification(cert)).toBe('incomplete');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('미검증'))).toBe(true);
  });
  it('does not promote a failed unsecured plan or run positive-level completion', async () => {
    animate.mockClear();
    const cert = certification('boxes', threeResults());
    cert.status = 'passed'; // A stale/mislabelled status must not override failed evidence.
    cert.attempts![0].passed = false;
    cert.attempts![0].scenarios[0].passed = false;
    cert.attempts![0].scenarios[0].maxHorizontalShiftM = .02;
    const target: PhysicsTarget = {
      mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
    cert.targetSignature = createPhysicsTargetSignature(target);
    const completed = await completeCertificationForWorkOrder(target, cert);
    expect(completed.status).toBe('failed');
    expect(animate).not.toHaveBeenCalled();
    expect(completed.attempts).toEqual(cert.attempts);
    expect(assessWorkOrderCertification(completed)).toBe('incomplete');
    expect(buildWorkOrderRecommendations(completed).some(item => item.includes('재배치'))).toBe(true);
  });
  it('does not promote legacy certificates with no baseline evidence', async () => {
    const cert = certification('boxes', threeResults()); delete cert.attempts;
    const target: PhysicsTarget = {
      mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
    cert.targetSignature = createPhysicsTargetSignature(target);
    expect((await completeCertificationForWorkOrder(target, cert)).status).toBe('failed');
  });

  it('rejects baseline evidence bound to another target', async () => {
    animate.mockClear();
    const cert = certification('boxes', threeResults());
    const target: PhysicsTarget = {
      mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
    cert.targetSignature = createPhysicsTargetSignature({ ...target, container: { ...target.container, height: 3 } });
    expect((await completeCertificationForWorkOrder(target, cert)).status).toBe('failed');
    expect(animate).not.toHaveBeenCalled();
  });

});
