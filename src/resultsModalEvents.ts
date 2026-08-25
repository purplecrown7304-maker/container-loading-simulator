import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { InertiaCertification } from './inertiaCertification';

export const OPEN_RESULTS_MODAL_EVENT = 'container-loading-open-results-modal';

export type ResultsModalDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification?: InertiaCertification;
};

export function openResultsModal(detail: ResultsModalDetail) {
  window.dispatchEvent(new CustomEvent<ResultsModalDetail>(OPEN_RESULTS_MODAL_EVENT, { detail }));
}
