import { FINAL_LOADING_WORKFLOW_ERROR_EVENT } from './finalWorkflowEvents';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  createPhysicsTargetSignature,
  hasBlockingLoadingRules,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { createLoadSimTargetSignature, isLoadSimAcceptedTarget, publishLoadSimAcceptance, type LoadSimAcceptance } from './rule-engine/acceptance';

export const OPEN_RESULTS_MODAL_EVENT = 'container-loading-open-results-modal';
export const REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT = 'container-loading:request-pallet-results-optimization';

export type ResultsModalDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification?: InertiaCertification;
  staticAcceptance?: LoadSimAcceptance;
};

export function certificationMatchesTarget(certification: InertiaCertification | undefined, target: PhysicsTarget | undefined) {
  return Boolean(
    certification?.status === 'passed'
    && target
    && !hasBlockingLoadingRules(target.result)
    && certification.mode === target.mode
    && certification.targetSignature === createPhysicsTargetSignature(target),
  );
}

export function openResultsModal(detail: ResultsModalDetail) {
  const current = readPhysicsTarget();
  const target: PhysicsTarget = {
    mode: detail.result.ruleEngineInput ? 'pallets' : 'boxes',
    container: detail.container, cargo: detail.cargo, result: detail.result,
    supports: current?.supports,
  };
  if (current && createLoadSimTargetSignature(current) !== createLoadSimTargetSignature(target)) return;
  const staticAcceptance = publishLoadSimAcceptance(target);
  if (!isLoadSimAcceptedTarget(target)) {
    window.dispatchEvent(new CustomEvent(FINAL_LOADING_WORKFLOW_ERROR_EVENT, {
      detail: { mode: target.mode, error: 'A 적재 규칙 최종 검사 실패', findings: staticAcceptance.operationalFindings },
    }));
    return;
  }
  const optional = detail.certification ?? readLatestInertiaCertification();
  const certification = optional && optional.mode === target.mode && optional.targetSignature === createPhysicsTargetSignature(target) ? optional : undefined;
  window.dispatchEvent(new CustomEvent<ResultsModalDetail>(OPEN_RESULTS_MODAL_EVENT, { detail: { ...detail, certification, staticAcceptance } }));
}
