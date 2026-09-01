import { describe, expect, it } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { InertiaCertification, InertiaScenario } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
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
  };
}

function threeResults(overrides: Partial<InertiaAnimationResult> = {}) {
  return Object.fromEntries(scenarios.map(scenario => [scenario, result({ ...overrides, scenario })])) as Record<InertiaScenario, InertiaAnimationResult>;
}

describe('work order inertia approval policy', () => {
  it('allows a completed caution result that is above PASS but below danger', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.02 }));
    expect(assessWorkOrderCertification(cert)).toBe('caution');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('미끄럼방지재'))).toBe(true);
  });

  it('blocks a box result above the danger movement threshold', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.031 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(false);
  });

  it('blocks dangerous pallet-relative cargo slip even when box movement is small', () => {
    const cert = certification('pallets', threeResults({ maxHorizontalShiftM: 0.006, maxCargoRelativeSlipM: 0.021 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(false);
  });

  it('does not approve an incomplete three-scenario test', () => {
    const cert = certification('boxes', {
      acceleration: result({ scenario: 'acceleration', maxHorizontalShiftM: 0.02 }),
      braking: result({ scenario: 'braking', maxHorizontalShiftM: 0.01 }),
    });
    expect(assessWorkOrderCertification(cert)).toBe('incomplete');
    expect(canCreateWorkOrder(cert)).toBe(false);
  });
});
