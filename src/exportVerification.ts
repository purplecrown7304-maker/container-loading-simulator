import type { PhysicsValidationSuite } from './engine/physicsValidation';
import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';

type PhysicsWindow = Window & { __containerLoadingLatestPhysics?: PhysicsValidationSuite };

function hasCurrentInertiaVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification || certification.status !== 'passed') return false;
  return certification.targetSignature === createPhysicsTargetSignature(target);
}

export function hasCurrentPhysicsVerification(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as PhysicsWindow).__containerLoadingLatestPhysics) || hasCurrentInertiaVerification();
}

/**
 * 현재 좌표와 정확히 일치하는 최종 관성 3종 PASS 또는 Rapier 물리검증이 있으면
 * 작업지시서/Excel을 검증 완료 상태로 취급한다.
 */
export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentPhysicsVerification()) return true;
  return window.confirm(
    `현재 적재안은 Rapier 물리 안정성 검증이 완료되지 않았습니다.\n\n${kind}에는 '물리 미검증' 결과가 포함될 수 있습니다. 그래도 내보내시겠습니까?`,
  );
}
