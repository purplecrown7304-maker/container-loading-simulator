import { runPhysicsValidationSuite, type PhysicsScenario, type PhysicsValidationSuite } from './engine/physicsValidation';
import { createPhysicsTargetSignature, requestCertifiedResults } from './inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, subscribePhysicsTarget, type PhysicsTarget } from './physicsTarget';

export const FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT = 'container-loading:final-physics-validation-progress';
export const FINAL_PHYSICS_VALIDATION_ERROR_EVENT = 'container-loading:final-physics-validation-error';
const PHYSICS_VALIDATION_RESULT_EVENT = 'container-loading:physics-validation-result';

let pendingPalletCertification = false;
let validationRunId = 0;

type FinalPhysicsWindow = Window & {
  __containerLoadingLatestPhysics?: PhysicsValidationSuite;
  __containerLoadingFinalPhysicsRunning?: boolean;
};

type FinalPhysicsProgress = {
  mode: PhysicsTarget['mode'];
  progress: number;
  scenario: PhysicsScenario;
};

function publishProgress(target: PhysicsTarget, progress: number, scenario: PhysicsScenario) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FinalPhysicsProgress>(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, {
    detail: { mode: target.mode, progress: Math.max(0, Math.min(100, Math.round(progress * 100))), scenario },
  }));
}

async function validateThenCertify(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  if (!target.result.placements.length && !(target.supports?.length)) return;

  const runId = ++validationRunId;
  const signature = createPhysicsTargetSignature(target);
  const physicsWindow = window as FinalPhysicsWindow;
  physicsWindow.__containerLoadingFinalPhysicsRunning = true;
  // 후보 선택 단계에서 남아 있던 물리 결과와 최종 검증 결과를 구분한다.
  physicsWindow.__containerLoadingLatestPhysics = undefined;
  publishProgress(target, 0, 'settle');

  try {
    const physics = await runPhysicsValidationSuite(
      target.container,
      target.result.placements,
      (value, scenario) => {
        if (runId !== validationRunId) return;
        publishProgress(target, value, scenario);
      },
      target.supports ?? [],
    );
    if (runId !== validationRunId) return;

    const current = readPhysicsTarget();
    if (!current || createPhysicsTargetSignature(current) !== signature) return;

    physicsWindow.__containerLoadingLatestPhysics = physics;
    physicsWindow.__containerLoadingFinalPhysicsRunning = false;
    publishProgress(target, 1, physics.worstScenario);
    window.dispatchEvent(new CustomEvent(PHYSICS_VALIDATION_RESULT_EVENT, {
      detail: { mode: target.mode, result: physics, finalValidation: true },
    }));

    // 실제 Rapier 최종 검증이 끝난 뒤에만 관성 3종을 시작한다.
    requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
  } catch (error) {
    if (runId !== validationRunId) return;
    physicsWindow.__containerLoadingFinalPhysicsRunning = false;
    console.error('Final Rapier physics validation failed', error);
    window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, {
      detail: { mode: target.mode, error },
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
