import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { runPhysicsValidationSuite, type PhysicsScenario, type PhysicsValidationSuite } from './engine/physicsValidation';
import { createPhysicsTargetSignature, requestCertifiedResults } from './inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, subscribePhysicsTarget, type PhysicsTarget } from './physicsTarget';

export const FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT = 'container-loading:final-physics-validation-progress';
export const FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT = 'container-loading:final-physics-validation-complete';
export const FINAL_PHYSICS_VALIDATION_ERROR_EVENT = 'container-loading:final-physics-validation-error';
const PHYSICS_VALIDATION_RESULT_EVENT = 'container-loading:physics-validation-result';

let pendingPalletCertification = false;
let validationRunId = 0;

type FinalPhysicsWindow = Window & {
  __containerLoadingLatestPhysics?: PhysicsValidationSuite;
  __containerLoadingFinalPhysicsRunning?: boolean;
  __containerLoadingFinalPhysicsSignature?: string;
  __containerLoadingFinalPhysicsResult?: PhysicsValidationSuite;
};

export type FinalPhysicsProgress = {
  mode: PhysicsTarget['mode'];
  signature: string;
  progress: number;
  scenario: PhysicsScenario;
};

export type FinalPhysicsComplete = {
  mode: PhysicsTarget['mode'];
  signature: string;
  result: PhysicsValidationSuite;
};

function publishProgress(target: PhysicsTarget, signature: string, progress: number, scenario: PhysicsScenario) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FinalPhysicsProgress>(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, {
    detail: {
      mode: target.mode,
      signature,
      progress: Math.max(0, Math.min(100, Math.round(progress * 100))),
      scenario,
    },
  }));
}

function clearFinalPhysicsRecord() {
  if (typeof window === 'undefined') return;
  const physicsWindow = window as FinalPhysicsWindow;
  physicsWindow.__containerLoadingFinalPhysicsSignature = undefined;
  physicsWindow.__containerLoadingFinalPhysicsResult = undefined;
  physicsWindow.__containerLoadingLatestPhysics = undefined;
}

export function readFinalPhysicsValidation() {
  if (typeof window === 'undefined') return undefined;
  const physicsWindow = window as FinalPhysicsWindow;
  if (!physicsWindow.__containerLoadingFinalPhysicsSignature || !physicsWindow.__containerLoadingFinalPhysicsResult) return undefined;
  return {
    signature: physicsWindow.__containerLoadingFinalPhysicsSignature,
    result: physicsWindow.__containerLoadingFinalPhysicsResult,
  };
}

async function validateThenCertify(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  if (!target.result.placements.length && !(target.supports?.length)) return;

  const runId = ++validationRunId;
  const signature = createPhysicsTargetSignature(target);
  const physicsWindow = window as FinalPhysicsWindow;
  physicsWindow.__containerLoadingFinalPhysicsRunning = true;
  clearFinalPhysicsRecord();
  publishProgress(target, signature, 0, 'settle');

  try {
    const physics = await runPhysicsValidationSuite(
      target.container,
      target.result.placements,
      (value, scenario) => {
        if (runId !== validationRunId) return;
        publishProgress(target, signature, value, scenario);
      },
      target.supports ?? [],
    );
    if (runId !== validationRunId) return;

    const current = readPhysicsTarget();
    if (!current || createPhysicsTargetSignature(current) !== signature) {
      physicsWindow.__containerLoadingFinalPhysicsRunning = false;
      return;
    }

    physicsWindow.__containerLoadingLatestPhysics = physics;
    physicsWindow.__containerLoadingFinalPhysicsSignature = signature;
    physicsWindow.__containerLoadingFinalPhysicsResult = physics;
    physicsWindow.__containerLoadingFinalPhysicsRunning = false;
    publishProgress(target, signature, 1, physics.worstScenario);

    const completeDetail: FinalPhysicsComplete = { mode: target.mode, signature, result: physics };
    window.dispatchEvent(new CustomEvent<FinalPhysicsComplete>(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, { detail: completeDetail }));
    window.dispatchEvent(new CustomEvent(PHYSICS_VALIDATION_RESULT_EVENT, {
      detail: { mode: target.mode, result: physics, finalValidation: true, signature },
    }));

    // 박스 모드는 사용자가 '작업지시서 발급'을 눌렀을 때와 같은 검증 엔진을 자동 호출한다.
    // 보고서는 열지 않고, 관성 3종 + 누락 시나리오 보완 + 제한된 안전 후보 비교까지만 끝낸다.
    if (target.mode === 'boxes') {
      requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport: false });
      return;
    }

    // 팔레트는 기존 팔레트 최종 게이트를 유지한다.
    requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
  } catch (error) {
    if (runId !== validationRunId) return;
    physicsWindow.__containerLoadingFinalPhysicsRunning = false;
    clearFinalPhysicsRecord();
    console.error('Final Rapier physics validation failed', error);
    window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, {
      detail: { mode: target.mode, signature, error },
    }));
  }
}

subscribePhysicsTarget(() => {
  if (!pendingPalletCertification) return;
  const target = readPhysicsTarget();
  if (!target || target.mode !== 'pallets' || !target.result.placements.length) return;
  pendingPalletCertification = false;
  void validateThenCertify(target);
});

export function requestExactCertification(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  publishPhysicsTarget(target);
  void validateThenCertify(target);
}

export function requestNextPalletCertification() {
  pendingPalletCertification = true;
}
