import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { LOADING_STRATEGY_STORAGE_KEY } from './engine/loadingEngine';
import { normalizeLoadingStrategy } from './engine/loadingStrategies';
import { runPhysicsValidationSuite, type PhysicsScenario, type PhysicsValidationSuite } from './engine/physicsValidation';
import { createPhysicsTargetSignature, requestCertifiedResults } from './inertiaCertification';
import { publishLoadingWorkflowProgress } from './loadingWorkflow';
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

function activeStrategy() {
  if (typeof window === 'undefined') return normalizeLoadingStrategy(undefined);
  return normalizeLoadingStrategy(window.localStorage.getItem(LOADING_STRATEGY_STORAGE_KEY));
}

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
  publishLoadingWorkflowProgress({
    mode: target.mode,
    strategy: activeStrategy(),
    phase: 'physics-validation',
    percent: 55 + Math.round(Math.max(0, Math.min(1, progress)) * 15),
    title: '최종 Rapier 물리 검증',
    detail: `${scenario} · ${Math.round(progress * 100)}%`,
  });
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

    publishLoadingWorkflowProgress({
      mode: target.mode,
      strategy: activeStrategy(),
      phase: 'inertia-validation',
      percent: 72,
      title: '관성 테스트 자동 실행',
      detail: '출발 가속 · 급정거 · 급회전 3종 검증',
    });

    // BOX keeps the established DirectWorkOrderOptimizer path: inertia + bounded
    // rearrangement search. PALLET keeps FinalCertificationGate and its support model.
    if (target.mode === 'boxes') {
      requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport: false });
      return;
    }

    requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
  } catch (error) {
    if (runId !== validationRunId) return;
    physicsWindow.__containerLoadingFinalPhysicsRunning = false;
    clearFinalPhysicsRecord();
    console.error('Final Rapier physics validation failed', error);
    publishLoadingWorkflowProgress({
      mode: target.mode,
      strategy: activeStrategy(),
      phase: 'failed',
      percent: 100,
      title: '물리 검증 실패',
      detail: '검증되지 않은 후보는 finalLayout으로 확정하지 않았습니다.',
    });
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
