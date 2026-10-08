import { aConfig, isARules } from './loadingRuleset';
import type { ContainerSpec, Placement, ValidationIssue } from './types';

const EPSILON = 1e-9;

/** LOADING_RULES R-5 (대표 결정 2026-10-08): 권장 천장 여유 5 cm. `ContainerSpec.ceilingClearanceM`으로 바꾼다(0 = 여유 없음). */
export const DEFAULT_CEILING_CLEARANCE_M = 0.05;
/** Engine default when a spec does not set the field: none. The app sets the recommended value when it builds the spec from equipment. */
const UNSET_CEILING_CLEARANCE_M = 0;

/** Legacy ceiling clearance in metres. A-rules keep their own margins and are not affected. */
export function ceilingClearance(container: ContainerSpec): number {
  if (isARules(container)) return 0;
  const value = container.ceilingClearanceM ?? UNSET_CEILING_CLEARANCE_M;
  return Number.isFinite(value) && value > 0 && value < container.height ? value : 0;
}

/** Highest point cargo, pallets and packaging may reach. */
export function usableHeight(container: ContainerSpec): number {
  return container.height - ceilingClearance(container);
}

/**
 * Planning envelope for packers that read `container.height` directly: the clearance is folded
 * into the height once and switched off, so it is never subtracted twice. Bounds checks on the
 * original container give the same limit through `usableHeight`.
 */
export function planningContainer(container: ContainerSpec): ContainerSpec {
  const clearance = ceilingClearance(container);
  return clearance > 0 ? { ...container, height: container.height - clearance, ceilingClearanceM: 0 } : container;
}

export function isInsideContainer(container: ContainerSpec, placement: Placement): boolean {
  if (isARules(container)) {
    const cfg=aConfig(container), e=cfg.epsilon/1000;
    return placement.x>=-e && placement.y>=-e && placement.z>=-e && placement.x+placement.length<=container.length-cfg.margins.l/1000+e && placement.y+placement.width<=container.width-cfg.margins.w/1000+e && placement.z+placement.height<=container.height-cfg.margins.h/1000+e;
  }
  return (
    placement.x >= -EPSILON &&
    placement.y >= -EPSILON &&
    placement.z >= -EPSILON &&
    placement.x + placement.length <= container.length + EPSILON &&
    placement.y + placement.width <= container.width + EPSILON &&
    placement.z + placement.height <= usableHeight(container) + EPSILON
  );
}

export function overlaps(a: Placement, b: Placement, tolerance = EPSILON): boolean {
  return !(
    a.x + a.length <= b.x + tolerance ||
    b.x + b.length <= a.x + tolerance ||
    a.y + a.width <= b.y + tolerance ||
    b.y + b.width <= a.y + tolerance ||
    a.z + a.height <= b.z + tolerance ||
    b.z + b.height <= a.z + tolerance
  );
}

export function validatePlacements(
  container: ContainerSpec,
  placements: Placement[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  placements.forEach((placement, index) => {
    if (!isInsideContainer(container, placement)) {
      issues.push({
        type: 'OUT_OF_BOUNDS',
        message: `화물 ${placement.cargoId}가 컨테이너 경계를 침범했습니다.`,
        placementIndexes: [index],
      });
    }
  });

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (overlaps(placements[i], placements[j], isARules(container) ? aConfig(container).epsilon/1000 : EPSILON)) {
        issues.push({
          type: 'COLLISION',
          message: `화물 ${placements[i].cargoId}와 ${placements[j].cargoId}가 겹칩니다.`,
          placementIndexes: [i, j],
        });
      }
    }
  }

  return issues;
}
