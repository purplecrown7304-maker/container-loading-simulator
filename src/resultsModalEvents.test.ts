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
      level: 0,
      levelLabel: '보조 고정 없음',
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
    results: {},
    payloadWithinLimit: true,
    ...overrides,
  };
}

describe('final results certification gate', () => {
  it('accepts only a passed certification for the exact current target', () => {
    expect(certificationMatchesTarget(certification(), target)).toBe(true);
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
