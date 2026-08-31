import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult } from './types';
import { validatePlacements } from './constraints';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';

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
 * DIRECT BOX 기본 엔진.
 *
 * 현재 기준은 Wall Completion + Homogeneous Block + Maximal Empty Space + Beam Search다.
 * 1) 같은 깊이의 컨테이너 폭을 가능한 한 먼저 완성한다.
 * 2) 동일 SKU 직육면체 블록을 우선하고, 보완 폭이 정확히 맞는 다른 SKU는 같은 벽에 붙여 채운다.
 * 3) 박스 접촉면을 보상하고, 재사용하기 어려운 길고 좁은 sliver/corridor 빈 공간을 강하게 감점한다.
 * 4) 벽/블록 단계 후 남은 수량만 같은 EMS/Beam 탐색에 단품 후보를 허용해 혼합 적재한다.
 *
 * 경계, 충돌, 지지율, 적층단, 누적 상부하중, 최대 payload는 hard constraint다.
 * 무거운 화물은 낮은 위치를 선호하며 한쪽 끝에 몰아넣지 않는다.
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

  const packed = packByBlockSpaceBeamV2(container, normalizedCargo, strategy);
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
