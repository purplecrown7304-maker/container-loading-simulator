import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';

export function hasCurrentInertiaVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification || certification.status !== 'passed') return false;
  return certification.targetSignature === createPhysicsTargetSignature(target);
}

/**
 * v2.6 final-output rule: a generic Rapier candidate score is not enough.
 * Work orders and Excel exports are verified only by the exact current target's
 * final acceleration/braking/cornering inertia PASS.
 */
export function hasCurrentPhysicsVerification(): boolean {
  return hasCurrentInertiaVerification();
}

/**
 * Final operational exports are fail-closed. Older versions allowed a user to
 * confirm and export an unverified plan; v2.6 intentionally removes that bypass.
 */
export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentInertiaVerification()) return true;
  if (typeof window !== 'undefined') {
    window.alert(
      `현재 적재안은 최종 관성 3종 PASS와 정확히 일치하지 않습니다.\n\n${kind} 출력은 차단되었습니다. 현재 적재안으로 최종 관성검증을 다시 실행하세요.`,
    );
  }
  return false;
}
