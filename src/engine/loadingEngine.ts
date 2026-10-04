import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { readManualOverride } from './manualOverride';
import { loadContainerWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import { createLoadingSourceSignature } from '../rule-engine/inputIdentity';

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
/** Retained caller type for preparation/UI migration; A chooses its own packing orders. */
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean };
type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function publishCorrections(corrections: AutoCorrectionRecord[]) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  (window as CorrectionWindow).__containerLoadingAutoCorrections = corrections;
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

export function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  publishCorrections(result.autoCorrections ?? []);
  const detail = { container, cargo, result, sourceSignature: createLoadingSourceSignature(container, cargo) };
  (window as CorrectionWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

/** Input changes invalidate the previous layout; packing starts only on an explicit run. */
export function pendingLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const result: LoadingResult = {
    placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0,
    validationIssues: [], operationalFindings: [], autoCorrections: [],
  };
  publishLoadingResult(container, cargo, result);
  return result;
}

/** Restore only after the sole A validator has rechecked the actual layout. */
export function restoreLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const manual = readManualOverride(container, cargo);
  if (!manual) return pendingLoadingResult(container, cargo);
  const checked = validateExistingWithLoadSim(container, cargo, manual.placements);
  if (checked.validationIssues.length) return pendingLoadingResult(container, cargo);
  const restored: LoadingResult = { ...manual, validationIssues: checked.validationIssues, operationalFindings: checked.operationalFindings, ruleEngine: 'load-sim' };
  publishLoadingResult(container, cargo, restored);
  return restored;
}

/** The supplied A pack/validate module is the only container-loading algorithm. */
export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const result = loadContainerWithLoadSim(container, cargo);
  if (options.publish !== false) publishLoadingResult(container, cargo, result);
  return result;
}
