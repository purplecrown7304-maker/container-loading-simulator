import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { assessWorkOrderCertification, canCreateWorkOrder } from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';

export function hasCurrentInertiaVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification) return false;
  if (certification.targetSignature !== createPhysicsTargetSignature(target)) return false;
  return canCreateWorkOrder(certification);
}

/**
 * The exact current target must complete all three inertia scenarios. Strict PASS
 * and CAUTION (below DANGER thresholds) are accepted for an operational work
 * order; DANGER or incomplete testing remains fail-closed.
 */
export function hasCurrentPhysicsVerification(): boolean {
  return hasCurrentInertiaVerification();
}

export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentInertiaVerification()) return true;
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
