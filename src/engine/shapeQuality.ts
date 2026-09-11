import type { ContainerSpec, Placement } from './types';

export type ShapeQualityAssessment = {
  /** 운영상 다루기 어려운 중앙 고립 낱개. 안전 하드실패가 아니라 최적화 벌점이다. */
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

function isMiddleIsolated(container: ContainerSpec, item: Placement, all: Placement[]) {
  if (item.z > EPS) return false;
  const touchesAny = all.some(other => other !== item && touches(item, other));
  if (touchesAny) return false;
  const touchesWall = item.x <= EPS
    || item.y <= EPS
    || item.x + item.length >= container.length - EPS
    || item.y + item.width >= container.width - EPS;
  return !touchesWall;
}

/**
 * Shape quality is an optimization/operational score, not a hard safety verdict.
 * Rapier remains authoritative for actual movement/tilt safety.
 */
export function assessShapeQuality(container: ContainerSpec, placements: Placement[]): ShapeQualityAssessment {
  if (!placements.length) return { isolatedMiddleBoxes: 0, protrudingTowers: 0, fragmentedCargoTypes: 0, shapePenalty: 0, messages: [] };

  const byCargo = new Map<string, Placement[]>();
  for (const p of placements) byCargo.set(p.cargoId, [...(byCargo.get(p.cargoId) ?? []), p]);
  let fragmentedCargoTypes = 0;
  for (const items of byCargo.values()) {
    if (items.length >= 4 && componentCount(items) > 2) fragmentedCargoTypes += 1;
  }

  const isolatedMiddleBoxes = placements.filter(item => isMiddleIsolated(container, item, placements)).length;
  const shapePenalty = Math.min(35, fragmentedCargoTypes * 7 + isolatedMiddleBoxes * 4);
  const messages: string[] = [];
  if (isolatedMiddleBoxes) messages.push(`중앙에 다른 화물·벽과 연결되지 않은 낱개가 ${isolatedMiddleBoxes}개 있습니다.`);
  if (fragmentedCargoTypes) messages.push(`같은 품목이 여러 구역으로 분산된 종류가 ${fragmentedCargoTypes}개입니다.`);
  if (!messages.length) messages.push('동일 품목 묶음과 낱개 배치 형상이 양호합니다. 실제 안정성은 Rapier 물리 검증 결과를 사용합니다.');

  return { isolatedMiddleBoxes, protrudingTowers: 0, fragmentedCargoTypes, shapePenalty, messages };
}
