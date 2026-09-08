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

/**
 * 최종 결과 공개 여부와 안전 PASS 여부를 분리한다.
 * 현재 적재안과 정확히 일치하는 관성 결과라면 PASS/실패 모두 결과 화면을 열 수 있고,
 * 결과 화면 안에서 해당 상태를 경고로 표시한다. 오래된 다른 적재안의 인증 결과는 계속 거부한다.
 */
export function certificationMatchesTarget(certification: InertiaCertification | undefined, target: PhysicsTarget | undefined) {
  return Boolean(
    certification
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
