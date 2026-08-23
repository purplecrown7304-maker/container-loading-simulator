import { findMixedPlacement } from './mixedPacking';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

export type SpareCapacityRecommendation = {
  cargoId: string;
  name: string;
  additionalQuantity: number;
  additionalWeightKg: number;
  additionalVolumeM3: number;
  projectedLoadedWeightKg: number;
  projectedUsedVolumeM3: number;
  zones: Array<'안쪽' | '중앙' | '문쪽'>;
  firstPlacement?: Placement;
  stopReason: string;
};

const EPS = 1e-9;

function zoneOf(container: ContainerSpec, placement: Placement): '안쪽' | '중앙' | '문쪽' {
  const center = placement.x + placement.length / 2;
  if (center < container.length / 3) return '안쪽';
  if (center < container.length * 2 / 3) return '중앙';
  return '문쪽';
}

function itemVolume(item: CargoItem) {
  return item.length * item.width * item.height;
}

/**
 * 현재 적재 결과를 보존한 채 특정 품목을 추가로 몇 개 더 배치할 수 있는지 탐색한다.
 * 기존 혼합 적재 탐색과 동일한 충돌/지지/적층/상부하중 규칙을 사용한다.
 */
export function estimateAdditionalCargo(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
  item: CargoItem,
  maxProbe = 200,
): SpareCapacityRecommendation {
  const placements = result.placements.map(p => ({ ...p }));
  const cargoById = new Map(cargo.map(c => [c.id, c]));
  cargoById.set(item.id, item);
  let loadedWeightKg = result.loadedWeightKg;
  let usedVolumeM3 = result.usedVolumeM3;
  let quantity = 0;
  const added: Placement[] = [];
  const volume = itemVolume(item);
  const containerVolume = Math.max(EPS, container.length * container.width * container.height);
  const freeVolume = Math.max(0, containerVolume - result.usedVolumeM3);
  const volumeUpperBound = volume > EPS ? Math.ceil(freeVolume / volume) : 0;
  const weightUpperBound = item.weightKg > EPS
    ? Math.floor(Math.max(0, container.maxPayloadKg - result.loadedWeightKg) / item.weightKg)
    : Number.POSITIVE_INFINITY;
  const probeLimit = Math.max(1, Math.min(Math.floor(maxProbe), volumeUpperBound || maxProbe, weightUpperBound));
  let stopReason = '추가 적재 가능한 공간을 모두 사용했습니다.';

  for (let i = 0; i < probeLimit; i += 1) {
    if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) {
      stopReason = '컨테이너 최대 적재중량에 도달했습니다.';
      break;
    }
    const placement = findMixedPlacement(container, item, placements, cargoById);
    if (!placement) {
      stopReason = '충돌·지지·적층·상부하중 조건을 만족하는 추가 위치가 없습니다.';
      break;
    }
    placements.push(placement);
    added.push(placement);
    quantity += 1;
    loadedWeightKg += item.weightKg;
    usedVolumeM3 += volume;
  }

  if (quantity >= probeLimit && probeLimit >= maxProbe) stopReason = `탐색 상한 ${maxProbe}개까지 추가 적재 가능합니다.`;
  else if (quantity >= probeLimit && item.weightKg > EPS && probeLimit === weightUpperBound) stopReason = '컨테이너 최대 적재중량 기준 추가 한도에 도달했습니다.';
  else if (quantity >= probeLimit && probeLimit === volumeUpperBound) stopReason = '남은 체적 기준 추가 한도까지 탐색했습니다.';
  const zones = [...new Set(added.map(p => zoneOf(container, p)))];

  return {
    cargoId: item.id,
    name: item.name,
    additionalQuantity: quantity,
    additionalWeightKg: quantity * item.weightKg,
    additionalVolumeM3: quantity * volume,
    projectedLoadedWeightKg: loadedWeightKg,
    projectedUsedVolumeM3: usedVolumeM3,
    zones,
    firstPlacement: added[0],
    stopReason,
  };
}

function shortlistCargo(cargo: CargoItem[], limit = 24) {
  const valid = cargo.filter(item => item.length > 0 && item.width > 0 && item.height > 0 && item.weightKg >= 0);
  if (valid.length <= limit) return valid;
  const sorted = [...valid].sort((a, b) => itemVolume(b) - itemVolume(a));
  const half = Math.floor(limit / 2);
  const selected = [...sorted.slice(0, half), ...sorted.slice(-half)];
  return [...new Map(selected.map(item => [item.id, item])).values()].slice(0, limit);
}

export function recommendSpareCapacity(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
  maxRecommendations = 8,
): SpareCapacityRecommendation[] {
  return shortlistCargo(cargo)
    .map(item => estimateAdditionalCargo(container, cargo, result, item))
    .filter(item => item.additionalQuantity > 0)
    .sort((a, b) =>
      b.additionalVolumeM3 - a.additionalVolumeM3 ||
      b.additionalQuantity - a.additionalQuantity ||
      a.cargoId.localeCompare(b.cargoId),
    )
    .slice(0, Math.max(1, Math.floor(maxRecommendations)));
}
