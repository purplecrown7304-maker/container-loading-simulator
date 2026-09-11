import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { validatePlacements } from './constraints';
import { centerPlacementsOnContainer } from './containerCentering';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { packByStrictWalls } from './strictWallPacker';
import { rebalanceStrictWallPlacements } from './weightAwareWallReorder';

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

function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const detail = { container, cargo, result };
  (window as CorrectionWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

/**
 * DIRECT BOX loading policy.
 *
 * 1) StrictWallPacker builds a compact, physically valid arrangement while enforcing
 *    hard constraints: bounds, collision prevention, payload, stack layers, cumulative
 *    top-load limits and full support for upper boxes.
 * 2) Capacity/stability mode reorders only independently movable wall slices. A slice is
 *    cut only where no box crosses the boundary, so stacking/support geometry inside the
 *    slice remains unchanged. Heavy slices are placed closer to the horizontal target
 *    center without creating an internal corridor. Unloading mode skips this reorder so
 *    explicit unloading sequence remains authoritative.
 * 3) The completed arrangement is translated as one rigid X/Y group so its weighted
 *    center of gravity is as close as possible to the container target center. Translation
 *    is clamped by container walls and Z is never raised.
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
      publishCorrections([]);
      publishLoadingResult(container, normalizedCargo, result);
    }
    return result;
  }

  if (preflight.rejected.length === 0 && shouldPublish && options.strategy === undefined) {
    const manual = readManualOverride(container, normalizedCargo);
    if (manual) {
      publishCorrections(manual.autoCorrections ?? []);
      publishLoadingResult(container, normalizedCargo, manual);
      return manual;
    }
  }

  const packed = packByStrictWalls(container, normalizedCargo, strategy);
  const weightBalanced = strategy === 'unloading'
    ? packed.placements
    : rebalanceStrictWallPlacements(container, packed.placements);
  const finalPlacements = centerPlacementsOnContainer(container, weightBalanced);
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
    publishCorrections([]);
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}
