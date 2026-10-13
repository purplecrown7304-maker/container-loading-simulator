import { assessPhysicsVerification } from './physicsVerificationPolicy';
import { isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { createPhysicsTargetSignature, INERTIA_PASS_SHIFT_M, INERTIA_PASS_TILT_DEG, INERTIA_PASS_PALLET_CARGO_SLIP_M, INERTIA_PASS_SUPPORT_SHIFT_M, isInertiaStable, type InertiaCertification } from './inertiaCertification';
import { assessWorkOrderCertification, isInertiaCertificationComplete, isPhysicsTargetVerified, physicsTargetHardFailureReasons } from './inertiaWorkOrderPolicy';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

export type WorkflowVerificationState = {
  status: 'unrun' | 'running' | 'failed' | 'cancelled' | 'passed' | 'review';
  reason?: string;
};

export const WORKFLOW_VERIFICATION_CANCELLED_EVENT = 'container-loading:verification-cancelled';
export const WORKFLOW_VERIFICATION_ERROR_EVENT = 'container-loading:verification-error';
export type VerificationEventDetail = { mode?: PhysicsTarget['mode']; signature?: string; error?: unknown };

export function verificationEventMatchesTarget(detail: VerificationEventDetail | undefined, target: PhysicsTarget | undefined): boolean {
  if (detail?.mode && target && detail.mode !== target.mode) return false;
  return !detail?.signature || Boolean(target && detail.signature === createPhysicsTargetSignature(target));
}

export function certificationVerificationState(certification: InertiaCertification, target: PhysicsTarget | undefined): WorkflowVerificationState {
  if (!target || certification.mode !== target.mode || certification.targetSignature !== createPhysicsTargetSignature(target)) {
    return { status: 'unrun', reason: '적재안이 변경되었습니다. 현재 적재안으로 다시 검사하세요.' };
  }
  if (isPhysicsTargetVerified(target, certification)) return { status: 'passed' };
  if (!certification.payloadWithinLimit) {
    const added = certification.securing.estimatedAddedWeightKg;
    const total = target.result.loadedWeightKg + added;
    const excess = total - target.container.maxPayloadKg;
    const weights = Number.isFinite(total) && Number.isFinite(excess) && excess > 0
      ? ` 총 ${total.toFixed(1)} kg / 허용 ${target.container.maxPayloadKg.toFixed(1)} kg · ${excess.toFixed(1)} kg 초과.` : '';
    return { status: 'failed', reason: `허용중량 초과: 보강재 추가중량 ${added.toFixed(1)} kg을 포함하면 장비 허용중량을 초과합니다.${weights} 적재량 또는 보강안을 조정한 뒤 다시 검사하세요.` };
  }
  const hardFailures = physicsTargetHardFailureReasons(target);
  if (hardFailures.length) return { status: 'failed', reason: `적재 제약 검증 실패: ${hardFailures.join(' · ')}` };
  // A known transport failure is the cause, even in older records whose early stop
  // prevented the final physics suite. Never replace it with a generic missing-result message.
  const failures = (['acceleration', 'braking', 'cornering'] as const).flatMap(scenario => {
    const result = certification.results[scenario];
    if (!result || isInertiaStable(result, target.mode)) return [];
    const label = { acceleration: '출발 가속', braking: '급정거', cornering: '급회전' }[scenario];
    const metrics = [
      `수평 이동 ${(result.maxHorizontalShiftM * 1000).toFixed(1)} / ${(INERTIA_PASS_SHIFT_M * 1000).toFixed(0)} mm`,
      `기울기 ${result.maxTiltDeg.toFixed(2)} / ${INERTIA_PASS_TILT_DEG.toFixed(1)}°`,
    ];
    if (target.mode === 'pallets') metrics.push(
      `화물 미끄럼 ${((result.maxCargoRelativeSlipM ?? result.maxHorizontalShiftM) * 1000).toFixed(1)} / ${(INERTIA_PASS_PALLET_CARGO_SLIP_M * 1000).toFixed(0)} mm`,
      `팔레트 이동 ${((result.maxSupportShiftM ?? 0) * 1000).toFixed(1)} / ${(INERTIA_PASS_SUPPORT_SHIFT_M * 1000).toFixed(0)} mm`,
    );
    return [`${label}: ${metrics.join(', ')} (측정 / 허용)`];
  });
  if (failures.length) {
    const incomplete = !isInertiaCertificationComplete(certification) ? ['관성 3종 검사도 미완료입니다.'] : [];
    return { status: 'failed', reason: ['관성 기준 초과', ...failures, ...incomplete, '재배치 또는 고정 보강 후 다시 검사하세요. 출고 승인은 차단됩니다.'].join(' · ') };
  }
  const physics = assessPhysicsVerification(target, certification);
  if (physics.status !== 'passed') return { status: 'failed', reason: `${physics.reasons.join(' · ')} 출고 승인은 차단되며 검토용 문서만 사용할 수 있습니다.` };
  if (!isInertiaCertificationComplete(certification)) {
    return { status: 'failed', reason: `관성 3종 검사 미완료 (${Object.keys(certification.results).length}/3). 현재 적재안으로 다시 검사하세요.` };
  }
  if (isLimitReviewTarget(target) && certification.failedScenarios.length === 0) return { status: 'review', reason: LIMIT_REVIEW_WARNING };
  const level = assessWorkOrderCertification(certification);
  return { status: 'failed', reason: level === 'danger'
    ? '관성 검사에서 위험 기준을 초과했습니다. 재배치 또는 고정 보강 후 다시 검사하세요.'
    : '관성 검사는 끝났지만 내부 PASS 기준을 충족하지 못했습니다. 보완사항을 확인하고 다시 검사하세요.' };
}

export function failedVerificationState(error: unknown): WorkflowVerificationState {
  const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const cancelled = /CANCELLED|CANCELED|ABORTED|취소/i.test(reason);
  return { status: cancelled ? 'cancelled' : 'failed', reason: reason || '최종 물리검증 실행에 실패했습니다. 다시 검사하세요.' };
}

/** Only explicit operator cancellation emits this; input changes reset to unrun. */
export function publishVerificationCancelled() {
  const target = readPhysicsTarget();
  window.dispatchEvent(new CustomEvent<VerificationEventDetail>(WORKFLOW_VERIFICATION_CANCELLED_EVENT, {
    detail: { mode: target?.mode, signature: target ? createPhysicsTargetSignature(target) : undefined, error: '사용자가 검사를 취소했습니다. 다시 실행할 수 있습니다.' },
  }));
}

export function publishVerificationFailure(error: unknown, target: PhysicsTarget) {
  window.dispatchEvent(new CustomEvent<VerificationEventDetail>(WORKFLOW_VERIFICATION_ERROR_EVENT, {
    detail: { mode: target.mode, signature: createPhysicsTargetSignature(target), error },
  }));
}

export function verificationStatusLabel(state: WorkflowVerificationState): string {
  return { unrun: '검증 대기', running: '검사 중', failed: '검증 실패', cancelled: '검증 취소', passed: '검증 통과', review: 'WHAT-IF 검토용' }[state.status];
}
