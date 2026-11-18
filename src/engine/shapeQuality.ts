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

/** Reference all-pairs search: the definition the fast sweep below must reproduce. */
export function componentCountAllPairs(items: Placement[]) {
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
 * Number of connected groups under `touches`.
 *
 * Two cartons can only touch when one starts (in X or in Y) where the other ends. The
 * cartons are therefore sorted by their start coordinate once per axis and each carton
 * is compared only with those starting at its end face, instead of with every other
 * carton. The window is a superset (twice the tolerance) and every candidate still
 * passes the unchanged `touches` predicate, so the groups are identical to the former
 * all-pairs search; only pairs that cannot touch are skipped.
 */
export function componentCount(items: Placement[]) {
  const count = items.length;
  if (count <= 1) return count;
  // The sorted sweep needs ordered coordinates. Anything else keeps the reference search.
  if (!items.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.length) && Number.isFinite(p.width))) {
    return componentCountAllPairs(items);
  }
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i += 1) parent[i] = i;
  let components = count;
  const root = (index: number) => {
    let current = index;
    while (parent[current] !== current) { parent[current] = parent[parent[current]]; current = parent[current]; }
    return current;
  };
  const linkAlong = (start: (p: Placement) => number, end: (p: Placement) => number) => {
    const order = Array.from({ length: count }, (_, index) => index).sort((a, b) => start(items[a]) - start(items[b]) || a - b);
    const starts = order.map(index => start(items[index]));
    for (let i = 0; i < count; i += 1) {
      const face = end(items[i]);
      if (!Number.isFinite(face)) continue;
      let low = 0, high = count;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (starts[middle] < face - 2 * EPS) low = middle + 1; else high = middle;
      }
      const current = items[i], top = current.z + current.height;
      for (let k = low; k < count && starts[k] <= face + 2 * EPS; k += 1) {
        const j = order[k];
        if (j === i) continue;
        // `touches` needs a vertical overlap in both of its branches; most cartons that
        // share this face are in another tier, so test that first.
        const other = items[j];
        if (!(Math.min(top, other.z + other.height) - Math.max(current.z, other.z) > EPS)) continue;
        if (!touches(current, other)) continue;
        const a = root(i), b = root(j);
        if (a !== b) { parent[a] = b; components -= 1; }
      }
    }
  };
  linkAlong(p => p.x, p => p.x + p.length);
  linkAlong(p => p.y, p => p.y + p.width);
  return components;
}

/**
 * 형상 평가는 이제 안전 판정이 아니라 운영 효율만 평가한다.
 * 중앙 낱개/돌출 타워는 정적 규칙으로 벌점화하지 않고 Rapier에서 실제 이동·전도 여부를 검사한다.
 * 여기서는 동일 품목이 과도하게 여러 구역으로 분산되는지만 최적화 힌트로 남긴다.
 */
export function assessShapeQuality(_container: ContainerSpec, placements: Placement[]): ShapeQualityAssessment {
  if (!placements.length) return { isolatedMiddleBoxes: 0, protrudingTowers: 0, fragmentedCargoTypes: 0, shapePenalty: 0, messages: [] };
  // The viewer, the result tabs and the summary each ask for the same plan again on
  // every render. The answer is reused for the same placement list only while every
  // value the assessment reads still equals the copy taken when it was computed; a list
  // edited afterwards (even in place) is assessed again.
  if (placements.length < SHAPE_REUSE_MIN_PLACEMENTS) return computeShapeQuality(placements);
  const known = recentShapes.get(placements);
  if (known && sameShapeInput(known, placements)) return { ...known.result, messages: [...known.result.messages] };
  const result = computeShapeQuality(placements);
  recentShapes.set(placements, { ...shapeInput(placements), result: { ...result, messages: [...result.messages] } });
  return result;
}

const SHAPE_REUSE_MIN_PLACEMENTS = 256;
type ShapeInput = { ids: string[]; values: Float64Array };
const recentShapes = new WeakMap<Placement[], ShapeInput & { result: ShapeQualityAssessment }>();

/** Exact copy of everything the assessment reads: cargo id and box geometry, in order. */
function shapeInput(placements: Placement[]): ShapeInput {
  const ids = new Array<string>(placements.length), values = new Float64Array(placements.length * 6);
  for (let i = 0, k = 0; i < placements.length; i += 1, k += 6) {
    const p = placements[i];
    ids[i] = p.cargoId;
    values[k] = p.x; values[k + 1] = p.y; values[k + 2] = p.z;
    values[k + 3] = p.length; values[k + 4] = p.width; values[k + 5] = p.height;
  }
  return { ids, values };
}

/** Strict equality per value, so a NaN never counts as unchanged. */
function sameShapeInput(known: ShapeInput, placements: Placement[]) {
  if (known.ids.length !== placements.length) return false;
  const { ids, values } = known;
  for (let i = 0, k = 0; i < placements.length; i += 1, k += 6) {
    const p = placements[i];
    if (ids[i] !== p.cargoId || values[k] !== p.x || values[k + 1] !== p.y || values[k + 2] !== p.z
      || values[k + 3] !== p.length || values[k + 4] !== p.width || values[k + 5] !== p.height) return false;
  }
  return true;
}

function computeShapeQuality(placements: Placement[]): ShapeQualityAssessment {
  const byCargo = new Map<string, Placement[]>();
  for (const p of placements) {
    const items = byCargo.get(p.cargoId);
    if (items) items.push(p); else byCargo.set(p.cargoId, [p]);
  }
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
