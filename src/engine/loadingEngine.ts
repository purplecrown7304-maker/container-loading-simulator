import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { validatePlacements } from './constraints';
import { containerInputError, preflightCargoInput } from './inputPreflight';
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

/**
 * DIRECT BOX 안전 우선 엔진.
 *
 * 자동 적재는 저장된 manual override를 재사용하지 않고 매번 현재 안전 엔진으로 다시 계산한다.
 * 바닥 적재는 컨테이너 폭 방향으로 lane을 서로 맞붙인 하나의 wall을 완성한 뒤에만 다음 x 구간으로 진행한다.
 * 따라서 화물-빈통로-화물 형태의 내부 longitudinal/lateral corridor는 생성하지 않는다.
 * 남는 폭은 컨테이너 측벽 쪽 한 곳에만 남을 수 있다.
 * 상부 혼합 적재는 바로 아래 박스와 바닥면이 정확히 일치하고 100% 지지되는 경우에만 허용한다.
 *
 * 경계, 충돌, 최대 적층단, 누적 상부 허용중량, 최대 payload는 hard constraint다.
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

  const packed = packByStrictWalls(container, normalizedCargo, strategy);
  const result: LoadingResult = {
    placements: packed.placements,
    remaining: [...preflight.rejected, ...packed.remaining],
    loadedWeightKg: packed.loadedWeightKg,
    usedVolumeM3: packed.usedVolumeM3,
    validationIssues: validatePlacements(container, packed.placements),
    autoCorrections: [],
  };

  if (shouldPublish) {
    publishCorrections([]);
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}
