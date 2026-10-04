// 배치 탐색. 정렬한 화물을 하나씩 후보 위치에 놓아 보는 탐욕 방식이며,
// 정렬 순서를 바꿔 여러 번 시도한 뒤 가장 좋은 결과를 고른다.
// 모든 배치는 canPlace()를 통과해야 하므로 결과는 하드 제약을 만족한다.

import type { Box, Config, Item, ItemType, Orientation, Placement, Space } from './types';
import { DEFAULT_CONFIG } from './presets';
import {
  allowedOrientations,
  boxOf,
  canPlace,
  centerOfGravity,
  orientedSize,
  overlapXY,
  validate,
} from './validate';
import type { ValidationResult } from './validate';

export type SortStrategy = 'weight' | 'volume' | 'footprint';

export interface PackOptions {
  /** App integration: retain constraints absent from A without changing its defaults. */
  acceptCandidate?: (placements: Placement[], candidate: Placement) => boolean;
  candidateKey?: (result: PackResult) => number[];
  config?: Partial<Config>;
  /** 정렬 순서를 무작위로 흔들어 추가로 시도하는 횟수. 기본 8 */
  iterations?: number;
  seed?: number;
  /** 무게중심이 허용 범위를 벗어나면 화물 전체를 밀어 맞춘다(컨테이너는 길이·폭, 트럭은 폭). 기본 true */
  centerCargo?: boolean;
  /** 화물 하나당 전체 검사를 시도할 후보 수 상한. 기본 400 */
  maxAttemptsPerItem?: number;
}

export interface PackResult {
  /** 적재 순서대로 정렬된 배치 */
  placements: Placement[];
  unplaced: Item[];
  validation: ValidationResult;
  /** 채택된 정렬 방식 */
  strategy: string;
  /** 무게중심을 맞추려고 전체를 도어 쪽으로 민 거리 mm. 0보다 크면 앞벽 쪽 빈 공간을 블로킹해야 한다 */
  shiftX: number;
  /** 같은 이유로 전체를 우측으로 민 거리 mm */
  shiftY: number;
}

const TYPE_PRIORITY: Record<ItemType, number> = {
  long: 0,
  machine: 1,
  roll: 2,
  drum: 2,
  pallet: 3,
  bag: 4,
  carton: 5,
};

const volume = (it: Item): number => it.dims.l * it.dims.w * it.dims.h;
const footprint = (it: Item): number => it.dims.l * it.dims.w;

/** 적재 순서 정렬: 마지막 착지 먼저, 유형 우선순위, 위에 못 올리는 화물은 뒤로, 그다음 크기 */
export function sortItems(items: Item[], strategy: SortStrategy): Item[] {
  const size = (it: Item): number =>
    strategy === 'weight' ? it.weight : strategy === 'volume' ? volume(it) : footprint(it);
  return [...items].sort((a, b) => {
    const sa = a.stopSeq ?? Infinity;
    const sb = b.stopSeq ?? Infinity;
    if (sa !== sb) return sb - sa;
    const fa = a.maxTopLoad === 0 ? 1 : 0;
    const fb = b.maxTopLoad === 0 ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const ta = TYPE_PRIORITY[a.type];
    const tb = TYPE_PRIORITY[b.type];
    if (ta !== tb) return ta - tb;
    if (size(a) !== size(b)) return size(b) - size(a);
    if (a.weight !== b.weight) return b.weight - a.weight;
    return (a.groupId ?? '').localeCompare(b.groupId ?? '') || a.id.localeCompare(b.id);
  });
}

function bucketKey(it: Item): string {
  return `${it.stopSeq ?? 'x'}|${it.maxTopLoad === 0 ? 1 : 0}|${TYPE_PRIORITY[it.type]}`;
}

/** 같은 착지·유형 묶음 안에서만 이웃한 화물의 순서를 바꾼다 */
function perturb(order: Item[], rand: () => number): Item[] {
  const out = [...order];
  for (let i = 0; i + 1 < out.length; i++) {
    if (bucketKey(out[i]) === bucketKey(out[i + 1]) && rand() < 0.3) {
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  }
  return out;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Candidate {
  x: number;
  y: number;
  z: number;
  o: Orientation;
  base: number;
  h: number;
}

/** 정해진 순서대로 한 번 적재한다 */
export function packOnce(order: Item[], space: Space, cfg: Config, maxAttempts = 400, acceptCandidate?: PackOptions['acceptCandidate']): { placements: Placement[]; unplaced: Item[] } {
  const placements: Placement[] = [];
  const boxes: Box[] = [];
  const unplaced: Item[] = [];
  const points = new Map<string, { x: number; y: number }>([['0,0', { x: 0, y: 0 }]]);
  const addPoint = (x: number, y: number): void => {
    points.set(`${x},${y}`, { x, y });
  };
  const e = cfg.epsilon;
  const tol = cfg.heightTolerance;
  const maxX = space.inner.l - cfg.margins.l;
  const maxY = space.inner.w - cfg.margins.w;
  const weightLimit = space.maxPayload * cfg.payloadRatio;
  const roof = space.inner.h - cfg.margins.h;
  let weight = 0;
  // 남은 화물 중 가장 작은 변. 이보다 좁은 틈만 남은 후보점은 버린다
  const minDimFrom = new Array<number>(order.length + 1).fill(Infinity);
  for (let i = order.length - 1; i >= 0; i--) {
    const d = order[i].dims;
    minDimFrom[i] = Math.min(minDimFrom[i + 1], d.l, d.w, d.h);
  }

  for (let idx = 0; idx < order.length; idx++) {
    const item = order[idx];
    const minDim = minDimFrom[idx];
    if (weight + item.weight > weightLimit + 1e-6) {
      unplaced.push(item);
      continue;
    }
    const seen = new Set<string>();
    const cands: Candidate[] = [];
    for (const [ptKey, pt] of points) {
      // 이 점 바로 위의 화물 윗면. 어떤 화물을 놓아도 이 높이보다 낮아질 수 없다
      let zPoint = 0;
      for (const b of boxes) {
        if (b.z1 > zPoint && b.x0 <= pt.x + e && pt.x + e < b.x1 && b.y0 <= pt.y + e && pt.y + e < b.y1) zPoint = b.z1;
      }
      if (roof - zPoint < minDim || maxX - pt.x < minDim || maxY - pt.y < minDim) {
        points.delete(ptKey);
        continue;
      }
      for (const o of allowedOrientations(item)) {
        const s = orientedSize(item.dims, o);
        if (pt.x + s.x > maxX + e || pt.y + s.y > maxY + e || zPoint + s.z > roof + e) continue;
        const key = `${pt.x},${pt.y},${s.x},${s.y},${s.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const fp: Box = { x0: pt.x, x1: pt.x + s.x, y0: pt.y, y1: pt.y + s.y, z0: 0, z1: 0 };
        // 밑에 있는 화물 중 가장 높은 윗면에 내려놓는다. 따라서 겹침은 생기지 않는다
        let z = 0;
        for (const b of boxes) {
          if (b.z1 > z && Math.min(fp.x1, b.x1) - Math.max(fp.x0, b.x0) > e && Math.min(fp.y1, b.y1) - Math.max(fp.y0, b.y0) > e) {
            z = b.z1;
          }
        }
        if (z > tol) {
          if (item.canBePlacedOnTop === false) continue;
          let area = 0;
          let blocked = false;
          for (let k = 0; k < boxes.length; k++) {
            const b = boxes[k];
            if (Math.abs(b.z1 - z) > tol) continue;
            const ov = overlapXY(fp, b);
            if (ov <= 0) continue;
            area += ov;
            const under = placements[k].item;
            // 위에 올릴 수 없는 화물, 먼저 내릴 화물 위에는 놓지 않는다
            if (under.maxTopLoad === 0) blocked = true;
            if (under.stopSeq !== undefined && item.stopSeq !== undefined && item.stopSeq > under.stopSeq) blocked = true;
          }
          if (blocked || area / (s.x * s.y) + 1e-9 < cfg.minSupportRatio) continue;
        }
        cands.push({ x: pt.x, y: pt.y, z, o, base: s.x * s.y, h: s.z });
      }
    }
    // 지게차 화물은 바닥을 먼저 채우고 자리가 없을 때만 올린다(층 쌓기).
    // 수작업 카톤은 앞벽에서부터 단면을 채워 나간다(벽 쌓기).
    // 같은 자리면 밑면이 넓고 낮은 방향을 고른다.
    const floorFirst = item.forklift ?? item.type !== 'carton';
    const lift = (c: Candidate): number => (floorFirst && c.z > tol ? 1 : 0);
    cands.sort((a, b) => lift(a) - lift(b) || a.x - b.x || a.z - b.z || a.y - b.y || b.base - a.base || a.h - b.h);

    let done = false;
    for (const c of cands.slice(0, maxAttempts)) {
      const p: Placement = { item, pos: { x: c.x, y: c.y, z: c.z }, orientation: c.o };
      if (canPlace(placements, p, space, cfg).length > 0 || (acceptCandidate && !acceptCandidate(placements, p))) continue;
      placements.push(p);
      const b = boxOf(p);
      // 새 후보점: 화물의 도어 쪽 모서리와 우측 모서리, 그리고 각각을 벽이나 이웃 화물까지 당긴 점
      let projY = 0;
      let projX = 0;
      for (const k of boxes) {
        const zHit = Math.min(b.z1, k.z1) - Math.max(b.z0, k.z0) > e;
        if (!zHit) continue;
        if (k.x0 <= b.x1 && b.x1 < k.x1 && k.y1 <= b.y0 + e) projY = Math.max(projY, k.y1);
        if (k.y0 <= b.y1 && b.y1 < k.y1 && k.x1 <= b.x0 + e) projX = Math.max(projX, k.x1);
      }
      addPoint(b.x1, b.y0);
      addPoint(b.x0, b.y1);
      addPoint(b.x1, projY);
      addPoint(projX, b.y1);
      boxes.push(b);
      weight += item.weight;
      done = true;
      break;
    }
    if (!done) unplaced.push(item);
  }
  return { placements, unplaced };
}

/** 컨테이너는 무게중심이 앞벽 쪽으로 쏠렸을 때, 트럭은 전축이 과하중일 때 전체를 뒤로 민다 */
function centerLongitudinally(ps: Placement[], space: Space, cfg: Config): number {
  if (ps.length === 0) return 0;
  const cg = centerOfGravity(ps);
  if (!cg) return 0;
  const L = space.inner.l;
  let want = 0;
  if (space.kind === 'container') {
    if (L / 2 - cg.x > L * cfg.cgLongTolerance) want = L / 2 - cg.x;
  } else if (space.axles) {
    // 트럭: 전축 하중이 허용값을 넘으면 넘지 않는 위치까지만 뒤로 민다
    const ax = space.axles;
    const W = ps.reduce((sum, p) => sum + p.item.weight, 0);
    const frontLimit = Math.min(ax.maxFront, cfg.legalAxleLoad * (ax.frontAxleCount ?? 1));
    const minCgX = ax.frontX + (1 - (frontLimit - ax.emptyFront) / W) * (ax.rearX - ax.frontX);
    if (cg.x < minCgX) want = Math.ceil(minCgX - cg.x);
  }
  if (want <= 0) return 0;
  const maxEnd = ps.reduce((m, p) => Math.max(m, boxOf(p).x1), 0);
  const shift = Math.floor(Math.min(want, L - cfg.margins.l - maxEnd));
  if (shift <= 0) return 0;
  for (const p of ps) p.pos = { ...p.pos, x: p.pos.x + shift };
  return shift;
}

/** 무게중심이 좌측으로 쏠렸으면 전체를 우측으로 민다 */
function centerLaterally(ps: Placement[], space: Space, cfg: Config): number {
  const cg = centerOfGravity(ps);
  if (!cg) return 0;
  const W = space.inner.w;
  if (W / 2 - cg.y <= W * cfg.cgLatTolerance) return 0;
  const maxEnd = ps.reduce((m, p) => Math.max(m, boxOf(p).y1), 0);
  const shift = Math.floor(Math.min(W / 2 - cg.y, W - cfg.margins.w - maxEnd));
  if (shift <= 0) return 0;
  for (const p of ps) p.pos = { ...p.pos, y: p.pos.y + shift };
  return shift;
}

export function pack(items: Item[], space: Space, options: PackOptions = {}): PackResult {
  const cfg: Config = { ...DEFAULT_CONFIG, ...options.config };
  const rand = lcg(options.seed ?? 1);
  const iterations = options.iterations ?? 8;

  const orders: { name: string; order: Item[] }[] = (['weight', 'volume', 'footprint'] as SortStrategy[]).map((s) => ({
    name: s,
    order: sortItems(items, s),
  }));
  for (let i = 0; i < iterations; i++) {
    const base = orders[i % 3];
    orders.push({ name: `${base.name}+shuffle${i + 1}`, order: perturb(base.order, rand) });
  }

  let best: PackResult | null = null;
  let bestKey: number[] = [];
  for (const { name, order } of orders) {
    const { placements, unplaced } = packOnce(order, space, cfg, options.maxAttemptsPerItem, options.acceptCandidate);
    const shiftX = options.centerCargo === false ? 0 : centerLongitudinally(placements, space, cfg);
    const shiftY = options.centerCargo === false ? 0 : centerLaterally(placements, space, cfg);
    const validation = validate(placements, space, cfg);
    const errors = validation.violations.filter((v) => v.severity === 'error').length;
    const usedLength = placements.reduce((m, p) => Math.max(m, boxOf(p).x1), 0) - shiftX;
    // 못 실은 부피 → 오류 수 → 사용 길이 순으로 작을수록 좋다
    const key = options.candidateKey?.({ placements, unplaced, validation, strategy: name, shiftX, shiftY }) ?? [unplaced.reduce((s, it) => s + volume(it), 0), errors, usedLength];
    const difference = key.findIndex((n, i) => n !== bestKey[i]);
    const better = !best || (difference >= 0 && key[difference] < bestKey[difference]);
    if (better) {
      best = { placements, unplaced, validation, strategy: name, shiftX, shiftY };
      bestKey = key;
    }
  }
  return best!;
}
