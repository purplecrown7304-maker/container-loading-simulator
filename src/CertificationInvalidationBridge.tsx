import { useEffect } from 'react';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, PHYSICS_TARGET_EVENT } from './physicsTarget';

/**
 * 적재 좌표/팔레트 물리 대상 또는 사용자가 편집하는 입력값이 바뀌면 과거 관성 PASS를 즉시 폐기한다.
 * 결과 보기 게이트는 targetSignature도 비교하지만, 이 브리지는 3D/출력 UI가
 * 잠깐이라도 오래된 보강 결과를 표시하거나 이전 PhysicsTarget을 재인증하는 것을 막는 1차 방어선이다.
 */
export default function CertificationInvalidationBridge() {
  useEffect(() => {
    const invalidateCertification = () => clearLatestInertiaCertification();
    const invalidateEditedPlan = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
      clearLatestInertiaCertification();
      clearPhysicsTarget();
    };

    window.addEventListener(LOADING_RESULT_EVENT, invalidateCertification);
    window.addEventListener(PHYSICS_TARGET_EVENT, invalidateCertification);
    document.addEventListener('input', invalidateEditedPlan, true);
    document.addEventListener('change', invalidateEditedPlan, true);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, invalidateCertification);
      window.removeEventListener(PHYSICS_TARGET_EVENT, invalidateCertification);
      document.removeEventListener('input', invalidateEditedPlan, true);
      document.removeEventListener('change', invalidateEditedPlan, true);
    };
  }, []);
  return null;
}
