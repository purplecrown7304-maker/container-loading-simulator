import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { assessWorkOrderCertification, isWorkOrderSafetyApproved } from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';

export function hasCurrentInertiaVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification) return false;
  if (certification.targetSignature !== createPhysicsTargetSignature(target)) return false;
  return isWorkOrderSafetyApproved(certification);
}

/**
 * 물리검증 완료 표시는 PASS/주의 승인에만 사용한다.
 * 위험/미완료 결과도 작업지시서 자체는 출력할 수 있지만 검증 완료로 표시하지 않는다.
 */
export function hasCurrentPhysicsVerification(): boolean {
  return hasCurrentInertiaVerification();
}

export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentInertiaVerification()) return true;

  // 작업지시서는 검증 상태와 관계없이 항상 생성한다.
  // 위험/미완료 여부는 보고서의 배지·워터마크·권장사항으로 명확히 남긴다.
  if (kind.includes('작업지시서')) return true;

  if (typeof window !== 'undefined') {
    const target = readPhysicsTarget();
    const certification = readLatestInertiaCertification();
    const matches = Boolean(target && certification && certification.targetSignature === createPhysicsTargetSignature(target));
    const level = matches && certification ? assessWorkOrderCertification(certification) : 'incomplete';
    const reason = level === 'danger'
      ? '관성 테스트에서 위험 기준을 초과했습니다. 재배치 또는 보강 후 다시 검사하세요.'
      : '현재 적재안의 출발·급정거·급회전 3종 검사가 완료되지 않았거나 최신 적재안과 일치하지 않습니다.';
    window.alert(`${kind} 출력은 현재 차단되어 있습니다.\n\n${reason}`);
  }
  return false;
}
