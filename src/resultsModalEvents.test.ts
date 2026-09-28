import { describe, expect, it } from 'vitest';
import type { InertiaCertification } from './inertiaCertification';
import { createPhysicsTargetSignature } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';
import { certificationMatchesTarget } from './resultsModalEvents';

const target: PhysicsTarget = {
  mode: 'boxes',
  container: { length: 2, width: 1, height: 1, maxPayloadKg: 1000 },
  cargo: [{ id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5, weightKg: 10, quantity: 1 }],
  result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.5, width: 0.5, height: 0.5, weightKg: 10 }],
    remaining: [],
    loadedWeightKg: 10,
    usedVolumeM3: 0.125,
    validationIssues: [],
  },
};

function certification(overrides: Partial<InertiaCertification> = {}): InertiaCertification {
  return {
    status: 'passed',
    mode: 'boxes',
    targetSignature: createPhysicsTargetSignature(target),
    testedAt: '2026-08-25T00:00:00.000Z',
    securing: {
      level: 1,
      levelLabel: '마무리 포장',
      palletCount: 0,
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
    testedScenarios: 3,
    passedScenarios: 3,
    failedScenarios: [],
    maxHorizontalShiftM: 0.005,
    maxTiltDeg: 0.5,
    results: Object.fromEntries((['acceleration', 'braking', 'cornering'] as const).map(scenario => [scenario, { scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: 0.005, maxTiltDeg: 0.5 } ])),
    payloadWithinLimit: true,
    attempts: ([0, 1] as const).map(level => ({
      level, phase: level === 0 ? 'unsecured' : 'secured', levelLabel: level === 0 ? '무포장' : '마무리 포장',
      payloadWithinLimit: true, passed: true,
      scenarios: (['acceleration', 'braking', 'cornering'] as const).map(scenario => ({ scenario, passed: true, maxHorizontalShiftM: 0.005, maxTiltDeg: 0.5 })),
    })),
    ...overrides,
  };
}

describe('final results certification gate', () => {
  it('accepts only a passed certification for the exact current target', () => {
    expect(certificationMatchesTarget(certification(), target)).toBe(true);
  });

  it('rejects a status-only PASS without the unsecured and secured proof', () => {
    expect(certificationMatchesTarget(certification({ attempts: undefined }), target)).toBe(false);
  });

  it('rejects failed raw loading even when finishing is marked passed', () => {
    const cert = certification();
    cert.attempts![0].passed = false;
    expect(certificationMatchesTarget(cert, target)).toBe(false);
  });

  it('rejects raw loading alone without finishing revalidation', () => {
    const cert = certification();
    cert.securing.level = 0;
    cert.attempts = cert.attempts!.slice(0, 1);
    expect(certificationMatchesTarget(cert, target)).toBe(false);
  });

  it('rejects a stale signature even when status is passed', () => {
    expect(certificationMatchesTarget(certification({ targetSignature: 'stale' }), target)).toBe(false);
  });

  it('rejects a passed certification from a different mode', () => {
    expect(certificationMatchesTarget(certification({ mode: 'pallets' }), target)).toBe(false);
  });

  it('rejects missing target or failed certification', () => {
    expect(certificationMatchesTarget(certification(), undefined)).toBe(false);
    expect(certificationMatchesTarget(certification({ status: 'failed' }), target)).toBe(false);
  });
});
