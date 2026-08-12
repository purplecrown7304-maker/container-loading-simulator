import type { ContainerSpec, Placement } from './types';

export type ShapeQualityAssessment = {
  isolatedMiddleBoxes: number;
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

export function assessShapeQuality(container: ContainerSpec, placements: Placement[]): ShapeQualityAssessment {
  if (!placements.length) return { isolatedMiddleBoxes: 0, protrudingTowers: 0, fragmentedCargoTypes: 0, shapePenalty: 0, messages: [] };

  const isolatedMiddleBoxes = placements.filter((p, index) => {
    const centerY = p.y + p.width / 2;
    const middle = centerY > container.width * 0.28 && centerY < container.width * 0.72;
    if (!middle) return false;
    const sameLevelNeighbor = placements.some((other, j) => j !== index && Math.abs(other.z - p.z) <= EPS && touches(p, other));
    return !sameLevelNeighbor;
  }).length;

  const topByBand = new Map<number, number>();
  for (const p of placements) {
    const band = Math.round((p.x / Math.max(container.length, EPS)) * 20);
    topByBand.set(band, Math.max(topByBand.get(band) ?? 0, p.z + p.height));
  }
  let protrudingTowers = 0;
  for (const [band, height] of topByBand) {
    const left = topByBand.get(band - 1) ?? 0;
    const right = topByBand.get(band + 1) ?? 0;
    const neighbor = Math.max(left, right);
    if (height > container.height * 0.55 && height - neighbor > container.height * 0.28) protrudingTowers += 1;
  }

  const byCargo = new Map<string, Placement[]>();
  for (const p of placements) byCargo.set(p.cargoId, [...(byCargo.get(p.cargoId) ?? []), p]);
  let fragmentedCargoTypes = 0;
  for (const items of byCargo.values()) {
    if (items.length >= 4 && componentCount(items) > 2) fragmentedCargoTypes += 1;
  }

  const shapePenalty = Math.min(45, isolatedMiddleBoxes * 5 + protrudingTowers * 8 + fragmentedCargoTypes * 7);
  const messages: string[] = [];
  if (isolatedMiddleBoxes) messages.push(`중앙에 주변 연결이 약한 낱개 박스 ${isolatedMiddleBoxes}개가 있습니다.`);
  if (protrudingTowers) messages.push(`주변보다 과도하게 높은 돌출 구역 ${protrudingTowers}곳이 있습니다.`);
  if (fragmentedCargoTypes) messages.push(`같은 품목이 여러 구역으로 분산된 종류가 ${fragmentedCargoTypes}개입니다.`);
  if (!messages.length) messages.push('적재 형상이 비교적 연속적이고 균형적입니다.');

  return { isolatedMiddleBoxes, protrudingTowers, fragmentedCargoTypes, shapePenalty, messages };
}
