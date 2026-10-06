import { expect, it } from 'vitest';
import { certificationVerificationState, failedVerificationState, verificationEventMatchesTarget } from './workflowVerificationState';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

it('explains securing-weight payload excess without claiming any scenario completion', () => {
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [], remaining: [], loadedWeightKg: 99, usedVolumeM3: 0, validationIssues: [] } };
  const certification: InertiaCertification = { mode: 'boxes', status: 'failed', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: { ...buildSecuringUsage(target, 1), estimatedAddedWeightKg: 2 }, testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'], results: {}, payloadWithinLimit: false, maxHorizontalShiftM: 0, maxTiltDeg: 0 };
  const state = certificationVerificationState(certification, target);
  expect(state.status).toBe('failed'); expect(state.reason).toContain('보강재 추가중량 2.0 kg'); expect(state.reason).toContain('총 101.0 kg'); expect(state.reason).toContain('1.0 kg 초과');
  expect(verificationEventMatchesTarget({ signature: 'old' }, target)).toBe(false);
  expect(verificationEventMatchesTarget({ mode: 'pallets' }, target)).toBe(false);
});

it('preserves error text and identifies explicit cancellation', () => {
  expect(failedVerificationState(new Error('INERTIA_CERTIFICATION_CANCELLED')).status).toBe('cancelled');
  expect(failedVerificationState('운영 규칙 검증 실패 2건')).toEqual({ status: 'failed', reason: '운영 규칙 검증 실패 2건' });
});
