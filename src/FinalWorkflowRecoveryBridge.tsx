import { useEffect, useRef } from 'react';
import { requestExactCertification } from './autoCertification';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import {
  createPhysicsTargetSignature,
  INERTIA_CERTIFICATION_EVENT,
  readLatestInertiaCertification,
} from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { APP_ACTION_EVENT } from './uiEvents';

const PHYSICS_RESULT_EVENT = 'container-loading:physics-validation-result';

type ResultDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type WorkflowWindow = Window & {
  __containerLoadingLatestResult?: ResultDetail;
  __containerLoadingLatestPhysics?: unknown;
};

function targetFor(detail: ResultDetail): PhysicsTarget {
  return { mode: 'boxes', ...detail };
}

function currentTargetIsCertified() {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || !certification) return false;
  return certification.targetSignature === createPhysicsTargetSignature(target);
}

/**
 * 최종 적재 흐름의 안전망.
 * 정상 흐름에서는 App이 적재 결과 직후 physics target을 발행하므로 아무 일도 하지 않는다.
 * 물리 최적화 예외/이벤트 누락으로 적재 결과까지만 발행되고 다음 단계가 시작되지 않은 경우에만
 * 현재 결과를 다시 Rapier 검증하고 관성 3종 검증으로 이어 준다.
 *
 * 가이드 화면의 '결과 확인'은 현재 물리 target과 관성 인증이 실제로 일치할 때만 통과시킨다.
 * 단순 저장/미리보기 적재 결과를 최종 결과로 오인해 물리 검증을 건너뛰는 경로를 막는다.
 */
export default function FinalWorkflowRecoveryBridge() {
  const runId = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    const onStart = () => {
      runId.current += 1;
      active.current = true;
    };

    const onCertification = () => {
      active.current = false;
    };

    const onLoadingResult = (event: Event) => {
      if (!active.current) return;
      const detail = (event as CustomEvent<ResultDetail>).detail
        ?? (window as WorkflowWindow).__containerLoadingLatestResult;
      if (!detail?.result.placements.length) return;

      const id = runId.current;
      const expectedTarget = targetFor(detail);
      const expectedSignature = createPhysicsTargetSignature(expectedTarget);

      window.setTimeout(() => {
        void (async () => {
          if (!active.current || runId.current !== id) return;

          const current = readPhysicsTarget();
          if (current && createPhysicsTargetSignature(current) === expectedSignature) return;

          try {
            const physics = await runPhysicsValidationSuite(detail.container, detail.result.placements);
            if (!active.current || runId.current !== id) return;
            (window as WorkflowWindow).__containerLoadingLatestPhysics = physics;
            window.dispatchEvent(new CustomEvent(PHYSICS_RESULT_EVENT, {
              detail: { mode: 'boxes', result: physics, recovered: true },
            }));
          } catch (error) {
            console.error('Final workflow physics recovery failed', error);
          }

          // 일반 물리검증이 실패하더라도 관성 검증 게이트에는 현재 적재안을 전달한다.
          // 게이트 자체가 실패/위험을 판정하므로 화면이 제약조건 단계에서 멈추지 않는다.
          if (!active.current || runId.current !== id) return;
          requestExactCertification(expectedTarget);
        })();
      }, 650);
    };

    const onGuidedResultClick = (event: MouseEvent) => {
      if (document.documentElement.dataset.guidedStep !== '5') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.guided-primary-cta');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      if (!(button.textContent ?? '').includes('결과 확인')) return;
      if (currentTargetIsCertified()) return;

      // InspectionStatusPanel의 '경고 발급 가능' 문구만 보고 결과 단계로 넘어가는 것을 차단한다.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // 최종 워크플로가 시작조차 안 된 저장/미리보기 결과라면 정상 자동 적재부터 다시 시작한다.
      if (!active.current) {
        window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
      }
    };

    window.addEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
    window.addEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    document.addEventListener('click', onGuidedResultClick, true);
    return () => {
      runId.current += 1;
      active.current = false;
      window.removeEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoadingResult);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
      document.removeEventListener('click', onGuidedResultClick, true);
    };
  }, []);

  return null;
}
