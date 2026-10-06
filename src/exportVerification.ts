import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { canCreateWorkOrder, isInertiaCertificationComplete, isPhysicsTargetVerified } from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';

function currentCertification() {
  if (typeof window === 'undefined') return undefined;
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification || target.mode !== certification.mode) return undefined;
  return certification.targetSignature === createPhysicsTargetSignature(target) ? certification : undefined;
}

/** All three scenarios ran for this exact target; this does not imply a PASS. */
export function hasCurrentInertiaCompletion(): boolean {
  const certification = currentCertification();
  return Boolean(certification && isInertiaCertificationComplete(certification));
}

/** Only a complete, payload-compliant, strict PASS verifies the current target. */
export function hasCurrentInertiaVerification(): boolean {
  const certification = currentCertification();
  return isPhysicsTargetVerified(readPhysicsTarget(), certification);
}

export function hasCurrentPhysicsVerification(): boolean {
  return hasCurrentInertiaVerification();
}

/** Warning-bearing review output is permitted independently of completion/PASS. */
export function hasCurrentWorkOrderResult(): boolean {
  const certification = currentCertification();
  return Boolean(certification && canCreateWorkOrder(certification));
}

export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentWorkOrderResult()) return true;
  if (typeof window !== 'undefined') {
    window.alert(`${kind} 출력은 현재 차단되어 있습니다.\n\n검증 결과가 없거나 최신 적재안과 일치하지 않습니다. 현재 적재안으로 다시 검사하세요.`);
  }
  return false;
}
