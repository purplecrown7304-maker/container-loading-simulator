import { orientationFromPlacement } from './cargoOrientation';
import { operationalErrors, validateOperationalLoading } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement, ValidationIssue } from './types';

const EPS = 1e-6;

function mapOperationalType(code: string): ValidationIssue['type'] {
  if (code === 'OUT_OF_BOUNDS' || code === 'HEIGHT_EXCEEDED' || code === 'LOAD_LINE_EXCEEDED' || code === 'DOOR_NOT_PASSABLE') return 'OUT_OF_BOUNDS';
  if (code === 'OVERLAP') return 'COLLISION';
  if (code === 'FLOATING' || code === 'INSUFFICIENT_SUPPORT' || code === 'CG_OUTSIDE_SUPPORT' || code.startsWith('AFTER_STOP_')) return 'UNSUPPORTED';
  if (code === 'TIER_EXCEEDED' || code === 'MUST_BE_ON_FLOOR' || code === 'UNLOAD_BLOCKED' || code === 'UNLOAD_BLOCKED_ABOVE') return 'STACK_LIMIT';
  if (code === 'TOP_LOAD_EXCEEDED' || code === 'NO_STACK_ON_TOP' || code === 'TOP_PRESSURE_EXCEEDED') return 'TOP_LOAD';
  if (code === 'PAYLOAD_EXCEEDED' || code === 'LINE_LOAD_EXCEEDED' || code.includes('AXLE') || code === 'GROSS_WEIGHT_EXCEEDED' || code.startsWith('CG_')) return 'PAYLOAD';
  return 'INVALID_CARGO';
}

/**
 * Authoritative final audit.
 *
 * The legacy simulator-specific stacking/support rules were removed from this path.
 * Geometry and safety are now decided by the uploaded load-sim rule set through
 * validateOperationalLoading(). This function only adds source-data integrity and
 * registered-quantity checks that are necessary to map the generic rule result back
 * into the app's existing ValidationIssue UI.
 */
export function auditLoading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();

  placements.forEach((placement, index) => {
    const item = byId.get(placement.cargoId);
    counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);

    if (![placement.x, placement.y, placement.z, placement.length, placement.width, placement.height, placement.weightKg].every(Number.isFinite)
      || Math.min(placement.length, placement.width, placement.height) <= 0 || placement.weightKg < 0) {
      issues.push({ type: 'INVALID_CARGO', message: '화물 치수·좌표·중량이 유효하지 않습니다.', placementIndexes: [index] });
      return;
    }
    if (!item || Math.abs(placement.weightKg - item.weightKg) > EPS || !orientationFromPlacement(item, placement.length, placement.width, placement.height)) {
      issues.push({ type: 'INVALID_CARGO', message: '등록 화물의 규격·허용 회전·중량과 배치가 일치하지 않습니다.', placementIndexes: [index] });
    }
  });

  for (const [id, count] of counts) {
    const quantity = byId.get(id)?.quantity ?? 0;
    if (count > quantity) {
      issues.push({
        type: 'QUANTITY',
        message: `화물 ${id}의 등록 수량을 초과했습니다.`,
        placementIndexes: placements.flatMap((placement, index) => placement.cargoId === id ? [index] : []),
      });
    }
  }

  for (const finding of operationalErrors(validateOperationalLoading(container, cargo, placements))) {
    issues.push({
      type: mapOperationalType(finding.code),
      message: `[${finding.code}] ${finding.message}`,
      placementIndexes: finding.placementIndexes,
    });
  }
  return issues;
}
