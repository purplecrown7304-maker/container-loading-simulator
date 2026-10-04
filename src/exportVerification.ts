import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';
import { isLoadSimAcceptedTarget } from './rule-engine/acceptance';

export function hasCurrentInertiaVerification(): boolean {
  if (typeof window === 'undefined') return false;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification) return false;
  if (certification.targetSignature !== createPhysicsTargetSignature(target)) return false;
  return certification.testedScenarios === 3
    && ['acceleration', 'braking', 'cornering'].every(scenario => Boolean(certification.results?.[scenario as keyof typeof certification.results]));
}

/**
 * Optional dynamic-inspection completion only. This never grants loading/output
 * acceptance, which belongs to the independent A-rule proof.
 */
export function hasCurrentPhysicsVerification(): boolean {
  return hasCurrentInertiaVerification();
}

export function confirmUnverifiedExport(kind: string): boolean {
  if (isLoadSimAcceptedTarget(readPhysicsTarget())) return true;
  if (typeof window !== 'undefined') window.alert(`${kind} 출력은 현재 A 적재 규칙의 최종 검사를 통과한 배치에서만 가능합니다. 최신 적재 결과를 확인하세요.`);
  return false;
}
