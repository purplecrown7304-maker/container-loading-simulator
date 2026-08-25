import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { requestCertifiedResults, type InertiaCertification } from './inertiaCertification';

export const OPEN_RESULTS_MODAL_EVENT = 'container-loading-open-results-modal';

export type ResultsModalDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification?: InertiaCertification;
};

export function openResultsModal(detail: ResultsModalDetail) {
  if (detail.certification?.status !== 'passed') {
    requestCertifiedResults({ container: detail.container, cargo: detail.cargo, result: detail.result });
    return;
  }
  window.dispatchEvent(new CustomEvent<ResultsModalDetail>(OPEN_RESULTS_MODAL_EVENT, { detail }));
}
