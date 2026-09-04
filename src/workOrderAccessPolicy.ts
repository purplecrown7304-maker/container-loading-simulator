import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import { validatePlacements } from './engine/constraints';
import type { ContainerSpec, LoadingResult } from './engine/types';

const EPS = 1e-9;

export type PalletWorkOrderSnapshot = {
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
};

/**
 * 작업지시서 출력 차단은 실제로 작업할 수 없는 물리 오류에만 사용한다.
 * 무게중심 편차, 관성 검증 미완료/주의/위험, 국부하중 경고 같은 운영 검토 항목은
 * 보고서에 경고로 남기되 출력 자체를 막지 않는다.
 */
export function boxWorkOrderHardBlockers(container: ContainerSpec, result: LoadingResult): string[] {
  const blockers: string[] = [];
  if (!result.placements.length) blockers.push('적재된 박스가 없습니다.');
  if (result.loadedWeightKg > container.maxPayloadKg + EPS) {
    blockers.push(`컨테이너 최대 적재중량을 ${(result.loadedWeightKg - container.maxPayloadKg).toFixed(1)} kg 초과했습니다.`);
  }
  for (const issue of result.validationIssues) blockers.push(issue.message);
  return [...new Set(blockers)];
}

export function palletWorkOrderHardBlockers(
  container: ContainerSpec,
  snapshot: PalletWorkOrderSnapshot,
): string[] {
  const blockers: string[] = [];
  const { spec, result } = snapshot;

  if (!result.pallets.length || !result.placements.length) blockers.push('적재된 팔레트/화물이 없습니다.');
  if (result.totalPalletizedWeightKg > container.maxPayloadKg + EPS) {
    blockers.push(`팔레트 포함 적재중량이 컨테이너 최대 적재중량을 ${(result.totalPalletizedWeightKg - container.maxPayloadKg).toFixed(1)} kg 초과했습니다.`);
  }
  if (result.maxUsedStackLevel > spec.maxStackLevels) {
    blockers.push(`팔레트 최대 적층단 ${spec.maxStackLevels}단을 초과했습니다.`);
  }

  for (const pallet of result.pallets) {
    const outside = pallet.x < -EPS
      || pallet.y < -EPS
      || pallet.z < -EPS
      || pallet.x + pallet.length > container.length + EPS
      || pallet.y + pallet.width > container.width + EPS
      || pallet.z + pallet.height > container.height + EPS;
    if (outside) blockers.push(`P${pallet.palletIndex} 팔레트가 컨테이너 경계를 침범했습니다.`);
    if (pallet.cargoWeightKg > spec.maxLoadKg + EPS) {
      blockers.push(`P${pallet.palletIndex} 팔레트 화물중량이 팔레트 허용중량 ${spec.maxLoadKg} kg을 초과했습니다.`);
    }
    if (pallet.stackLevel > spec.maxStackLevels) {
      blockers.push(`P${pallet.palletIndex} 팔레트가 최대 적층단 ${spec.maxStackLevels}단을 초과했습니다.`);
    }
  }

  for (const issue of validatePlacements(container, result.placements)) blockers.push(issue.message);
  return [...new Set(blockers)];
}
