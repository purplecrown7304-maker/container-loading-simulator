import type { CargoItem, Placement, ValidationIssue } from '../engine/types';
import { allowedOrientations, orientedSize } from '../load-sim';
import { bPlacementToLoadSim } from './loadSimAdapter';

/** Validate the actual B/rendered footprint before letting an A orientation reconstruct it. */
export function existingPlacementIntegrityIssues(cargo: CargoItem[], placements: Placement[]): ValidationIssue[] {
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  placements.forEach((placement, index) => {
    const item = byCargo.get(placement.cargoId);
    const invalid = (message: string) => issues.push({ type: 'INVALID_CARGO', message: `${placement.cargoId}: ${message}`, placementIndexes: [index] });
    counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);
    if (!item) { invalid('등록된 품목 정보가 없습니다.'); return; }
    if (![placement.x, placement.y, placement.z, placement.length, placement.width, placement.height, placement.weightKg].every(Number.isFinite)
      || Math.min(placement.length, placement.width, placement.height, placement.weightKg) <= 0) {
      invalid('배치 치수·좌표·중량은 유효한 유한 값이어야 합니다.');
      return;
    }
    if (Math.abs(placement.weightKg - item.weightKg) > 1e-6) invalid('배치 중량이 등록 중량과 다릅니다.');
    const converted = bPlacementToLoadSim(placement, item, placement.cargoId);
    const allowed = allowedOrientations(converted.item);
    // An explicit orientation must agree with the actual size, not merely some other orientation.
    const choices = placement.loadSimOrientation ? [placement.loadSimOrientation] : allowed;
    const matched = choices.some(orientation => {
      if (!allowed.includes(orientation)) return false;
      const size = orientedSize(converted.item.dims, orientation);
      return Math.abs(size.x - placement.length * 1000) <= 1e-6
        && Math.abs(size.y - placement.width * 1000) <= 1e-6
        && Math.abs(size.z - placement.height * 1000) <= 1e-6;
    });
    if (!matched) invalid('배치 치수·방향이 등록 규격 또는 방향 메타데이터와 일치하지 않습니다.');
  });
  for (const [cargoId, count] of counts) {
    const item = byCargo.get(cargoId);
    if (item && count > item.quantity) issues.push({
      type: 'QUANTITY', message: `${cargoId}: 등록 수량 ${item.quantity}EA를 초과해 ${count}EA가 배치되었습니다.`,
      placementIndexes: placements.flatMap((p, index) => p.cargoId === cargoId ? [index] : []),
    });
  }
  return issues;
}
