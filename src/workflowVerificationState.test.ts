import { expect, it } from 'vitest';
import { certificationVerificationState, failedVerificationState, verificationEventMatchesTarget } from './workflowVerificationState';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';
import { workflowFailureText } from './inspectionPresentation';
import { setUiLanguage } from './uiLanguage';
import { withSecuredPhysicsFixture } from './testFixtures/physicsVerification';

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

it('shows measured braking failure before missing physics and never calls an untested turn a failure', () => {
  const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [], remaining: [], loadedWeightKg: 1, usedVolumeM3: 0, validationIssues: [] } };
  const braking = { scenario: 'braking' as const, fps: 0, simulatedSeconds: 2.5, cargoCount: 0, supportCount: 0, frames: [], maxHorizontalShiftM: .0396764, maxTiltDeg: 2.0977 };
  const cert: InertiaCertification = { mode: 'boxes', status: 'failed', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 3), testedScenarios: 2, passedScenarios: 1, failedScenarios: ['braking', 'cornering'], results: { acceleration: { ...braking, scenario: 'acceleration', maxHorizontalShiftM: .004, maxTiltDeg: .3 }, braking }, payloadWithinLimit: true, maxHorizontalShiftM: braking.maxHorizontalShiftM, maxTiltDeg: braking.maxTiltDeg };
  const state = certificationVerificationState(cert, target);
  expect(state.status).toBe('failed');
  expect(state.reason).toContain('급정거: 수평 이동 39.7 / 12 mm, 기울기 2.10 / 1.8°');
  expect(state.reason).toContain('미완료');
  expect(state.reason).not.toContain('결과가 없습니다');
  expect(state.reason).not.toContain('급회전:');
  const complete = withSecuredPhysicsFixture(target, { ...cert, testedScenarios: 3, failedScenarios: ['braking'], results: { ...cert.results, cornering: { ...braking, scenario: 'cornering', maxHorizontalShiftM: .005, maxTiltDeg: .3 } } });
  expect(certificationVerificationState(complete, target).reason).not.toContain('미완료');
  try {
    setUiLanguage('en');
    expect(workflowFailureText(state.reason!)).toContain('Horizontal shift 39.7 / 12 mm');
    expect(workflowFailureText(state.reason!)).not.toMatch(/[가-힣]/);
    setUiLanguage('vi');
    expect(workflowFailureText(state.reason!)).toContain('Dịch chuyển ngang 39.7 / 12 mm');
    expect(workflowFailureText(state.reason!)).not.toMatch(/[가-힣]/);
  } finally { setUiLanguage('ko'); }
});
