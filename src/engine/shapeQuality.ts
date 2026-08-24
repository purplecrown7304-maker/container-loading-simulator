import type { ContainerSpec, Placement } from './types';

export type ShapeQualityAssessment = {
  /** 호환성 유지용. 물리 안정성 판정에서는 더 이상 사용하지 않는다. */
  isolatedMiddleBoxes: number;
  /** 호환성 유지용. 돌출 높이는 Rapier 물리 검증이 판단한다. */
  protrudingTowers: number;
  fragmentedCargoTypes: number;
  shapePenalty: number;
  messages: string[];
};

const EPS = 1e-6;

function touches(a: Placement, b: Placement) {
  const xTouch = Math.abs(a.x + a.length - b.x) <= EPS || Math.abs(b.x + b.length - a.x) <= EPS;
  const yOverlap = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > EPS;
  const zOverlap = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > EPS;
  const yTouch = Math.abs(a.y + a.width - b.y) <= EPS || Math.abs(b.y + b.width - a.y) <= EPS;
  const xOverlap = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > EPS;
  return (xTouch && yOverlap && zOverlap) || (yTouch && xOverlap && zOverlap);
}

function componentCount(items: Placement[]) {
  if (items.length <= 1) return items.length;
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (visited.has(i)) continue;
    components += 1;
    const stack = [i];
    visited.add(i);
    while (stack.length) {
      const current = stack.pop()!;
      for (let j = 0; j < items.length; j += 1) {
        if (visited.has(j) || !touches(items[current], items[j])) continue;
        visited.add(j);
        stack.push(j);
      }
    }
  }
  return components;
}

/**
 * 형상 평가는 이제 안전 판정이 아니라 운영 효율만 평가한다.
 * 중앙 낱개/돌출 타워는 정적 규칙으로 벌점화하지 않고 Rapier에서 실제 이동·전도 여부를 검사한다.
 * 여기서는 동일 품목이 과도하게 여러 구역으로 분산되는지만 최적화 힌트로 남긴다.
 */
export function assessShapeQuality(_container: ContainerSpec, placements: Placement[]): ShapeQualityAssessment {
  if (!placements.length) return { isolatedMiddleBoxes: 0, protrudingTowers: 0, fragmentedCargoTypes: 0, shapePenalty: 0, messages: [] };

  const byCargo = new Map<string, Placement[]>();
  for (const p of placements) byCargo.set(p.cargoId, [...(byCargo.get(p.cargoId) ?? []), p]);
  let fragmentedCargoTypes = 0;
  for (const items of byCargo.values()) {
    if (items.length >= 4 && componentCount(items) > 2) fragmentedCargoTypes += 1;
  }

  const shapePenalty = Math.min(35, fragmentedCargoTypes * 7);
  const messages = fragmentedCargoTypes
    ? [`같은 품목이 여러 구역으로 분산된 종류가 ${fragmentedCargoTypes}개입니다. 안전성은 물리 검증에서 별도 판정합니다.`]
    : ['동일 품목 묶음 상태가 양호합니다. 실제 안정성은 Rapier 물리 검증 결과를 사용합니다.'];

  return { isolatedMiddleBoxes: 0, protrudingTowers: 0, fragmentedCargoTypes, shapePenalty, messages };
}
