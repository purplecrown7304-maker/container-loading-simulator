import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { validatePlacements } from './constraints';
import { centerPlacementsOnContainer } from './containerCentering';
import { packByHybridOptimizer } from './hybridLoadingOptimizer';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean };

type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function browserStrategy(): LoadingStrategy {
  if (typeof window === 'undefined') return 'capacity';
  const value = window.localStorage?.getItem(LOADING_STRATEGY_STORAGE_KEY);
  return value === 'stability' || value === 'unloading' ? value : 'capacity';
}

function publishCorrections(corrections: AutoCorrectionRecord[]) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  (window as CorrectionWindow).__containerLoadingAutoCorrections = corrections;
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

export function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  publishCorrections(result.autoCorrections ?? []);
  const detail = { container, cargo, result };
  (window as CorrectionWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

/** Input changes invalidate the previous layout; packing starts only on an explicit run. */
export function pendingLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const result: LoadingResult = {
    placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0,
    validationIssues: [], autoCorrections: [],
  };
  publishLoadingResult(container, cargo, result);
  return result;
}

/** Restore an explicitly applied layout without re-solving it on storage events. */
export function restoreLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const manual = readManualOverride(container, cargo);
  if (!manual) return pendingLoadingResult(container, cargo);
  publishLoadingResult(container, cargo, manual);
  return manual;
}

function averageDepthByPriority(cargo: CargoItem[], placements: Placement[]) {
  const priorities = new Map(
    cargo
      .filter(item => Number.isFinite(item.unloadPriority) && (item.unloadPriority ?? 0) > 0)
      .map(item => [item.id, item.unloadPriority as number]),
  );
  const grouped = new Map<number, number[]>();
  for (const placement of placements) {
    const priority = priorities.get(placement.cargoId);
    if (priority == null) continue;
    const list = grouped.get(priority) ?? [];
    list.push(placement.x + placement.length / 2);
    grouped.set(priority, list);
  }
  return [...grouped.entries()]
    .map(([priority, xs]) => ({ priority, x: xs.reduce((sum, value) => sum + value, 0) / xs.length }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * The door is the +X end of the container. Higher unloadPriority means later unloading,
 * so those items should sit deeper toward X=0. Some dense packers can produce the exact
 * reverse order while still scoring well on utilization. A whole-plan X reflection keeps
 * every collision/support/stack relation identical while correcting that reversed flow.
 */
function orientForUnloading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const rows = averageDepthByPriority(cargo, placements);
  if (rows.length < 2) return placements;

  let priorityDelta = 0;
  let depthDelta = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    priorityDelta += current.priority - previous.priority;
    depthDelta += current.x - previous.x;
  }

  // Desired relation is negative: later-unloaded cargo (higher priority) is deeper (smaller X).
  if (priorityDelta <= 0 || depthDelta <= 1e-9) return placements;
  return placements.map(placement => ({
    ...placement,
    x: Math.round((container.length - placement.x - placement.length) * 1_000_000) / 1_000_000,
  }));
}

/**
 * DIRECT BOX hybrid loading policy.
 *
 * Two deterministic solvers generate competing physically valid plans:
 *  - StrictWallPacker: dense homogeneous wall/block construction.
 *  - EMS Beam V2: homogeneous blocks + maximal empty spaces + residual-gap reuse.
 *
 * HybridLoadingOptimizer evaluates both plans with the selected operating strategy.
 * Capacity emphasizes utilization/completion, stability emphasizes low/balanced weight
 * distribution, and unloading emphasizes unload order while retaining all hard safety
 * constraints. Bounds/collision/payload violations can never be traded for a higher score.
 *
 * The selected arrangement is then translated as one rigid X/Y group so its weighted
 * horizontal center of gravity is as close as possible to the container target center.
 * Rigid translation preserves support, stacking and collision relationships and is
 * clamped by the container walls. Z is never raised.
 */
export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const strategy = options.strategy ?? browserStrategy();
  const shouldPublish = options.publish !== false;
  const preflight = preflightCargoInput(cargo);
  const normalizedCargo = preflight.cargo;
  const invalidContainer = containerInputError(container);

  if (invalidContainer) {
    const result: LoadingResult = {
      placements: [],
      remaining: [
        ...preflight.rejected,
        ...normalizedCargo.map((item) => ({ cargoId: item.id, quantity: item.quantity, reason: invalidContainer })),
      ],
      loadedWeightKg: 0,
      usedVolumeM3: 0,
      validationIssues: [],
      autoCorrections: [],
    };
    if (shouldPublish) {
      publishLoadingResult(container, normalizedCargo, result);
    }
    return result;
  }

  if (preflight.rejected.length === 0 && shouldPublish && options.strategy === undefined) {
    const manual = readManualOverride(container, normalizedCargo);
    if (manual) {
      publishLoadingResult(container, normalizedCargo, manual);
      return manual;
    }
  }

  const packed = packByHybridOptimizer(container, normalizedCargo, strategy);
  const centered = centerPlacementsOnContainer(container, packed.placements);
  const finalPlacements = strategy === 'unloading'
    ? orientForUnloading(container, normalizedCargo, centered)
    : centered;
  const result: LoadingResult = {
    placements: finalPlacements,
    remaining: [
      ...preflight.rejected,
      ...packed.remaining,
    ],
    loadedWeightKg: packed.loadedWeightKg,
    usedVolumeM3: packed.usedVolumeM3,
    validationIssues: validatePlacements(container, finalPlacements),
    autoCorrections: [],
  };

  if (shouldPublish) {
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}
