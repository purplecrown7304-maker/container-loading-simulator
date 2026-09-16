import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  requestCertifiedResults,
  type InertiaCertification,
} from './inertiaCertification';
import { restorePalletPhysicsTarget } from './palletTargetRestore';
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
  const certification = detail.certification ?? readLatestInertiaCertification();
  let target = readPhysicsTarget();

  // Guided step 6 unmounts the pallet viewer and therefore clears its live target.
  // A pallet certification tells us which mode owns the persisted snapshot, so the
  // exact target can be restored before deciding whether to open or re-validate.
  if (!target && certification?.mode === 'pallets') {
    target = restorePalletPhysicsTarget(detail.container, detail.cargo);
  }

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
