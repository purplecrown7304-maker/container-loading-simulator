import { validatePlacements } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const EPS = 0.0015;

export type LoadingSafetyGate = {
  passed: boolean;
  reasons: string[];
};

/**
 * 최종 적재안 확정 전 하드 게이트.
 * 점수가 아무리 높아도 이 검사를 통과하지 못한 후보는 최종 결과가 될 수 없다.
 */
export function validateFinalLoadingCandidate(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
): LoadingSafetyGate {
  const reasons: string[] = [];
  const geometry = validatePlacements(container, result.placements);
  if (geometry.length) reasons.push(...geometry.map(issue => issue.message));
  if (result.loadedWeightKg > container.maxPayloadKg + EPS) {
    reasons.push(`허용 적재중량 ${container.maxPayloadKg.toLocaleString()}kg을 초과했습니다.`);
  }

  const cargoById = new Map(cargo.map(item => [item.id, item]));
  const staged = [] as typeof result.placements;
  const ordered = [...result.placements].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
  for (const placement of ordered) {
    const item = cargoById.get(placement.cargoId);
    if (!item) {
      reasons.push(`${placement.cargoId}: 원본 화물 정보를 찾지 못했습니다.`);
      continue;
    }
    if (placement.z > EPS && !hasAdequateSupport(placement, staged, undefined, 0.999)) {
      reasons.push(`${placement.cargoId}: 바닥면이 충분히 지지되지 않는 허공/걸침 적재입니다.`);
    }
    if (!canPlaceByStackingRules(item, placement, staged, cargoById)) {
      reasons.push(`${placement.cargoId}: 최대 적층단 또는 압축/상부 허용중량을 초과합니다.`);
    }
    staged.push(placement);
  }

  return { passed: reasons.length === 0, reasons: [...new Set(reasons)] };
}
