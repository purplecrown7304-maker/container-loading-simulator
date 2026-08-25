import type { PhysicsValidationSuite } from './engine/physicsValidation';

type PhysicsWindow = Window & { __containerLoadingLatestPhysics?: PhysicsValidationSuite };

export function hasCurrentPhysicsVerification(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as PhysicsWindow).__containerLoadingLatestPhysics);
}

/**
 * 분석보고서 권고에 따라 물리 미검증 결과를 무심코 외부 공유하지 않도록 한다.
 * 미검증 상태에서는 명시적인 사용자 확인 없이는 작업지시서/Excel을 내보내지 않는다.
 */
export function confirmUnverifiedExport(kind: string): boolean {
  if (hasCurrentPhysicsVerification()) return true;
  return window.confirm(
    `현재 적재안은 Rapier 물리 안정성 검증이 완료되지 않았습니다.\n\n${kind}에는 '물리 미검증' 결과가 포함될 수 있습니다. 그래도 내보내시겠습니까?`,
  );
}
