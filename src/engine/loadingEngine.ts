import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { validatePlacements } from './constraints';
import { centerPlacementsWithFallSafety } from './fallSafetyCentering';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { filterOperationallyUnsafeShape } from './placementStabilityFilter';
import { packByStrictWalls } from './strictWallPacker';

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

function combineRemoved(...sources: Array<Map<string, number>>) {
  const combined = new Map<string, number>();
  for (const source of sources) {
    for (const [cargoId, quantity] of source) {
      combined.set(cargoId, (combined.get(cargoId) ?? 0) + quantity);
    }
  }
  return combined;
}

function mergeSafetyRemoved(
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>,
  removedByCargo: Map<string, number>,
) {
  const merged = new Map(remaining.map(item => [item.cargoId, { ...item }]));
  for (const [cargoId, quantity] of removedByCargo) {
    if (quantity <= 0) continue;
    const previous = merged.get(cargoId);
    const reason = '낙하·전도 방지를 위해 고적층 절벽, 큰 개방면, 급격한 높이 단차 또는 고립 적재를 안전 적재에서 제외';
    merged.set(cargoId, {
      cargoId,
      quantity: quantity + (previous?.quantity ?? 0),
      reason: previous ? `${previous.reason} / ${reason}` : reason,
    });
  }
  return [...merged.values()];
}

/**
 * DIRECT BOX 안전 우선 엔진.
 *
 * 자동 적재(runLoading)는 strategy를 명시해 호출하므로 저장된 manual override를 사용하지 않고
 * 매번 Strict Wall 엔진으로 다시 계산한다. strategy가 생략된 일반 화면 복원에서는 수동 편집 결과를 유지한다.
 *
 * 바닥 적재는 컨테이너 폭 방향으로 lane을 서로 맞붙인 하나의 wall을 완성한 뒤에만 다음 x 구간으로 진행한다.
 * 따라서 화물-빈통로-화물 형태의 내부 longitudinal/lateral corridor는 생성하지 않는다.
 * 남는 폭은 컨테이너 측벽 쪽 한 곳에만 남을 수 있다.
 * 상부 혼합 적재는 바로 아래 박스와 바닥면이 정확히 일치하고 100% 지지되는 경우에만 허용한다.
 *
 * 최종 결과에서는 별도 형상 가드를 적용해 1열 고층 기둥, 방향별 인접 적층 높이 급차,
 * 큰 빈 공간을 향한 고적층 개방면, 주변과 떨어진 낱개 섬 적재를 제거한다.
 * 높은 적층의 열린 가장자리는 낮게 만들고 안쪽으로 한 단씩 올라가는 계단형을 우선한다.
 * 안전한 위치가 없으면 적재율을 위해 억지로 쌓지 않고 미적재로 남긴다.
 *
 * 모든 수평 무게중심 기준점은 적재물 자체의 외곽/중점이 아니라 컨테이너 기하학적 중심
 * (length / 2, width / 2)이다. 화물 CG는 이 기준점과의 편차를 계산하기 위한 측정값일 뿐이다.
 * 중앙 이동으로 새 낙하 위험이 생기면 원래 한쪽 벽 배치로 되돌리지 않고, 위험한 상단 박스만
 * 제거한 뒤 다시 컨테이너 중심으로 보정한다. Z는 낮은 무게중심 원칙을 유지한다.
 *
 * 경계, 충돌, 낙하·전도 형상, 최대 적층단, 누적 상부 허용중량, 최대 payload는 hard constraint다.
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
  const filtered = filterOperationallyUnsafeShape(container, normalizedCargo, packed.placements);
  const centered = centerPlacementsWithFallSafety(container, normalizedCargo, filtered.placements);
  const finalPlacements = centered.placements;
  const safetyRemoved = combineRemoved(filtered.removedByCargo, centered.removedByCargo);
  const loadedWeightKg = finalPlacements.reduce((sum, placement) => sum + placement.weightKg, 0);
  const usedVolumeM3 = finalPlacements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0);
  const result: LoadingResult = {
    placements: finalPlacements,
    remaining: [
      ...preflight.rejected,
      ...mergeSafetyRemoved(packed.remaining, safetyRemoved),
    ],
    loadedWeightKg,
    usedVolumeM3,
    validationIssues: validatePlacements(container, finalPlacements),
    autoCorrections: [],
  };

  if (shouldPublish) {
    publishCorrections([]);
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}
