import { describe, expect, it } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { InertiaCertification, InertiaScenario } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  isWorkOrderSafetyApproved,
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

describe('work order inertia reporting policy', () => {
  it('allows a completed caution result and keeps it safety-approved', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.02 }));
    expect(assessWorkOrderCertification(cert)).toBe('caution');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(isWorkOrderSafetyApproved(cert)).toBe(true);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('미끄럼방지재'))).toBe(true);
  });

  it('still creates a work order above the danger movement threshold but does not safety-approve it', () => {
    const cert = certification('boxes', threeResults({ maxHorizontalShiftM: 0.031 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(isWorkOrderSafetyApproved(cert)).toBe(false);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('배치·수량 확인용'))).toBe(true);
  });

  it('still creates a pallet work order for dangerous relative slip but does not safety-approve it', () => {
    const cert = certification('pallets', threeResults({ maxHorizontalShiftM: 0.006, maxCargoRelativeSlipM: 0.021 }));
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(isWorkOrderSafetyApproved(cert)).toBe(false);
  });

  it('creates an incomplete work order as a warning document without safety approval', () => {
    const cert = certification('boxes', {
      acceleration: result({ scenario: 'acceleration', maxHorizontalShiftM: 0.02 }),
      braking: result({ scenario: 'braking', maxHorizontalShiftM: 0.01 }),
    });
    expect(assessWorkOrderCertification(cert)).toBe('incomplete');
    expect(canCreateWorkOrder(cert)).toBe(true);
    expect(isWorkOrderSafetyApproved(cert)).toBe(false);
    expect(buildWorkOrderRecommendations(cert).some(item => item.includes('검증이 완료되지 않은'))).toBe(true);
  });
});
