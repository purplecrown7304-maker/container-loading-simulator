import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { readManualOverride } from './manualOverride';
import { legacyIssuesFromLoadSim, packWithLoadSimRules, validateWithLoadSimRules } from './loadSimAdapter';

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';

/**
 * Kept only for UI/backward compatibility.
 * The uploaded load-sim packer is now the single canonical loading engine;
 * these names no longer select different rule sets or packing algorithms.
 */
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean };

type ResultWindow = Window & {
  __containerLoadingAutoCorrections?: LoadingResult['autoCorrections'];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function publishCorrections(result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const corrections = result.autoCorrections ?? [];
  (window as ResultWindow).__containerLoadingAutoCorrections = corrections;
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

export function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  publishCorrections(result);
  const detail = { container, cargo, result };
  (window as ResultWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

/** Input changes invalidate the previous layout; packing starts only on an explicit run. */
export function pendingLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const result: LoadingResult = {
    placements: [],
    remaining: [],
    loadedWeightKg: 0,
    usedVolumeM3: 0,
    validationIssues: [],
    operationalFindings: [],
    autoCorrections: [],
  };
  publishLoadingResult(container, cargo, result);
  return result;
}

/** Restore an explicitly applied layout only when the uploaded load-sim rules still accept it. */
export function restoreLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const manual = readManualOverride(container, cargo);
  if (!manual) return pendingLoadingResult(container, cargo);
  const checked = validateWithLoadSimRules(container, cargo, manual.placements);
  if (checked.findings.some(finding => finding.severity === 'error')) return pendingLoadingResult(container, cargo);
  const restored: LoadingResult = {
    ...manual,
    validationIssues: legacyIssuesFromLoadSim(checked.findings),
    operationalFindings: checked.findings,
    autoCorrections: [],
  };
  publishLoadingResult(container, cargo, restored);
  return restored;
}

/**
 * Canonical packing entry point.
 *
 * The previous hybrid wall/EMS/residual/top-layer rule stack has been removed from
 * the active path. Every automatic result now comes from the uploaded load-sim
 * pack()/validate() implementation, using its mm/kg coordinate model, hard rules,
 * warnings, center-of-gravity correction and unload-order policy.
 */
export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const result = packWithLoadSimRules(container, cargo);
  if (options.publish !== false) publishLoadingResult(container, cargo, result);
  return result;
}
