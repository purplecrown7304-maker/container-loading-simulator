import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  requestCertifiedResults,
  type InertiaCertification,
} from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

export const OPEN_RESULTS_MODAL_EVENT = 'container-loading-open-results-modal';
export const REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT = 'container-loading:request-pallet-results-optimization';

export type ResultsModalDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification?: InertiaCertification;
};

export function certificationMatchesTarget(certification: InertiaCertification | undefined, target: PhysicsTarget | undefined) {
  return Boolean(
    certification?.status === 'passed'
    && target
    && certification.mode === target.mode
    && certification.targetSignature === createPhysicsTargetSignature(target),
  );
}

export function openResultsModal(detail: ResultsModalDetail) {
  const target = readPhysicsTarget();
  const certification = detail.certification ?? readLatestInertiaCertification();
  const effectiveDetail: ResultsModalDetail = target?.mode === 'pallets'
    ? { container: target.container, cargo: target.cargo, result: target.result, certification }
    : { ...detail, certification };

  if (certificationMatchesTarget(certification, target)) {
    window.dispatchEvent(new CustomEvent<ResultsModalDetail>(OPEN_RESULTS_MODAL_EVENT, { detail: effectiveDetail }));
    return;
  }

  if (target?.mode === 'pallets') {
    window.dispatchEvent(new CustomEvent<ResultsModalDetail>(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, { detail: effectiveDetail }));
    return;
  }

  requestCertifiedResults({
    container: effectiveDetail.container,
    cargo: effectiveDetail.cargo,
    result: effectiveDetail.result,
  });
}
