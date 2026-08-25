import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { createPhysicsTargetSignature, requestCertifiedResults, type InertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';

export const OPEN_RESULTS_MODAL_EVENT = 'container-loading-open-results-modal';

export type ResultsModalDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification?: InertiaCertification;
};

export function openResultsModal(detail: ResultsModalDetail) {
  const target = readPhysicsTarget();
  const certification = detail.certification;
  const validCertification = Boolean(
    certification?.status === 'passed'
    && target
    && certification.mode === target.mode
    && certification.targetSignature === createPhysicsTargetSignature(target),
  );

  if (!validCertification) {
    requestCertifiedResults({ container: detail.container, cargo: detail.cargo, result: detail.result });
    return;
  }
  window.dispatchEvent(new CustomEvent<ResultsModalDetail>(OPEN_RESULTS_MODAL_EVENT, { detail }));
}
