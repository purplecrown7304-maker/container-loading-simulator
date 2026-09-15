import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { validatePlacements } from './constraints';
import { centerPlacementsOnContainer } from './containerCentering';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { fillSupportedTopVoids } from './mixedTopFill';
import { safelyRebalanceStrictWallPlacements } from './safeWeightAwareWallReorder';
import { packByStrictWalls } from './strictWallPacker';
import { consumeNextStrategyResultOverride } from './strategyResultOverride';
import { centerSafeWallsLaterally, reorderForUnloading, reorderHeavyWallsInside } from './operationalWallReorder';

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean };

type PublishedLoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: PublishedLoadingDetail;
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

function guidedRunNeedsCanvasCommit() {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.guidedWorkflow === 'true'
    && root.dataset.guidedStep === '5'
    && root.dataset.guidedRunInFlight === 'true';
}

function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const detail: PublishedLoadingDetail = { container, cargo, result };
  const runtime = window as CorrectionWindow;
  runtime.__containerLoadingLatestResult = detail;

  const dispatch = () => {
    // If the input/result was invalidated or replaced while React was committing the viewer,
    // never publish that stale result as the current guided result.
    if (runtime.__containerLoadingLatestResult !== detail) return;
    window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
  };

  if (!guidedRunNeedsCanvasCommit()) {
    dispatch();
    return;
  }

  // App receives the returned LoadingResult and calls setResult() immediately after this
  // function returns. GuidedWorkflowShell must not unlock step 6 before that React update
  // has reached BoxLoadingViewer. Two animation frames give React/Three the commit turn first,
  // so the complete 3D arrangement is visible in step 5 before "결과 확인" becomes available.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!guidedRunNeedsCanvasCommit()) return;
      dispatch();
    });
  });
}

/**
 * DIRECT BOX loading policy.
 * StrictWall remains the placement authority for the floor/wall skeleton. Post-processors move
 * complete rigid wall slices and center them first. Only after that stable base is finalized do we
 * fill fully supported upper voids with remaining mixed-size cartons. Every final result is revalidated.
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

  if (shouldPublish) {
    const optimized = consumeNextStrategyResultOverride(container, normalizedCargo, strategy);
    if (optimized) {
      publishCorrections(optimized.autoCorrections ?? []);
      publishLoadingResult(container, normalizedCargo, optimized);
      return optimized;
    }
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
  let operational = packed.placements;
  if (strategy === 'unloading') {
    operational = reorderForUnloading(container, normalizedCargo, operational);
  } else {
    // Existing policy: heavy cargo is considered first and should stay deeper whenever
    // a complete safe wall can be exchanged without changing support geometry.
    operational = reorderHeavyWallsInside(container, normalizedCargo, operational);
    operational = safelyRebalanceStrictWallPlacements(container, operational);
  }
  operational = centerSafeWallsLaterally(container, normalizedCargo, operational);
  const centeredBasePlacements = centerPlacementsOnContainer(container, operational);

  // 혼합 규격 상부 적재는 모든 벽 재배치/중앙정렬이 끝난 다음 수행한다.
  // 먼저 올린 뒤 벽을 이동시키면 아래 지지박스와 위 박스가 분리될 수 있기 때문이다.
  const topFilled = fillSupportedTopVoids(
    container,
    normalizedCargo,
    {
      placements: centeredBasePlacements,
      remaining: packed.remaining,
      loadedWeightKg: packed.loadedWeightKg,
      usedVolumeM3: packed.usedVolumeM3,
    },
    strategy,
  );
  const finalPlacements = topFilled.placements;
  const result: LoadingResult = {
    placements: finalPlacements,
    remaining: [
      ...preflight.rejected,
      ...topFilled.remaining,
    ],
    loadedWeightKg: topFilled.loadedWeightKg,
    usedVolumeM3: topFilled.usedVolumeM3,
    validationIssues: validatePlacements(container, finalPlacements),
    autoCorrections: [],
  };

  if (shouldPublish) {
    publishCorrections([]);
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}