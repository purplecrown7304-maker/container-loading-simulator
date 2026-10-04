// 적재 배치 검증 모듈.
// 각 check 함수는 Violation 배열을 돌려준다. validate()가 전체 파이프라인을 실행한다.

import { ALL_ORIENTATIONS, UPRIGHT_ORIENTATIONS } from './types';
import type {
  Accel,
  Box,
  Config,
  Dims,
  Item,
  Orientation,
  Placement,
  Space,
  Vec3,
  Violation,
} from './types';
import { DEFAULT_CONFIG } from './presets';

const G = 9.81;

// ───────────────────────── 기하 유틸 ─────────────────────────

/** 회전을 적용한 화물의 X, Y, Z 방향 크기 */
export function orientedSize(dims: Dims, o: Orientation): Vec3 {
  const pick = (c: string): number => (c === 'L' ? dims.l : c === 'W' ? dims.w : dims.h);
  return { x: pick(o[0]), y: pick(o[1]), z: pick(o[2]) };
}

export function boxOf(p: Placement): Box {
  const s = orientedSize(p.item.dims, p.orientation);
  return {
    x0: p.pos.x,
    x1: p.pos.x + s.x,
    y0: p.pos.y,
    y1: p.pos.y + s.y,
    z0: p.pos.z,
    z1: p.pos.z + s.z,
  };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** XY 평면에서 겹치는 면적 (mm²) */
export function overlapXY(a: Box, b: Box): number {
  return overlap1d(a.x0, a.x1, b.x0, b.x1) * overlap1d(a.y0, a.y1, b.y0, b.y1);
}

export function allowedOrientations(item: Item): Orientation[] {
  if (item.allowedOrientations) return item.allowedOrientations;
  if (item.thisSideUp || item.type !== 'carton') return UPRIGHT_ORIENTATIONS;
  return ALL_ORIENTATIONS;
}

function isForklift(item: Item): boolean {
  if (item.forklift !== undefined) return item.forklift;
  return item.type === 'pallet' || item.type === 'machine' || item.type === 'drum' || item.type === 'roll';
}

/** 회전을 반영한 화물 무게중심의 절대 좌표 */
export function itemCg(p: Placement): Vec3 {
  const b = boxOf(p);
  const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
  const off = p.item.cgOffset;
  if (!off) return c;
  const pick = (ch: string): number => (ch === 'L' ? off.l : ch === 'W' ? off.w : off.h);
  const o = p.orientation;
  return { x: c.x + pick(o[0]), y: c.y + pick(o[1]), z: c.z + pick(o[2]) };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

// ───────────────────────── 1. 경계 ─────────────────────────

export function checkBounds(ps: Placement[], space: Space, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const maxX = space.inner.l - cfg.margins.l;
  const maxY = space.inner.w - cfg.margins.w;
  const roof = space.inner.h - cfg.margins.h;
  const e = cfg.epsilon;
  for (const p of ps) {
    const b = boxOf(p);
    if (b.x0 < -e || b.y0 < -e || b.z0 < -e || b.x1 > maxX + e || b.y1 > maxY + e) {
      out.push({
        code: 'OUT_OF_BOUNDS',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 적재 공간(마진 적용)을 벗어남`,
      });
    }
    const top = isForklift(p.item) ? roof - cfg.forkliftClearance : roof;
    if (b.z1 > top + e) {
      out.push({
        code: 'HEIGHT_EXCEEDED',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 윗면 ${r1(b.z1)}mm가 허용 높이 ${r1(top)}mm 초과`,
        value: b.z1,
        limit: top,
      });
    }
    if (space.heightLimit !== undefined && b.z1 > space.heightLimit + e) {
      out.push({
        code: 'LOAD_LINE_EXCEEDED',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 적재 한계선 ${space.heightLimit}mm 초과`,
        value: b.z1,
        limit: space.heightLimit,
      });
    }
  }
  return out;
}

// ───────────────────────── 2. 도어 통과 ─────────────────────────

/** 후방 도어로만 들어가는 공간에서, 화물 자체가 도어 개구를 통과하는지 */
export function checkDoor(ps: Placement[], space: Space, cfg: Config): Violation[] {
  const out: Violation[] = [];
  if (!space.door) return out;
  const rearOnly = space.access.length === 1 && space.access[0] === 'rear';
  if (!rearOnly) return out;
  for (const p of ps) {
    const s = orientedSize(p.item.dims, p.orientation);
    const fork = isForklift(p.item);
    const needH = s.z + (fork ? cfg.forkliftClearance : 0);
    if (s.y > space.door.w + cfg.epsilon || needH > space.door.h + cfg.epsilon) {
      out.push({
        code: 'DOOR_NOT_PASSABLE',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 도어 개구(${space.door.w}×${space.door.h}) 통과 불가 (필요 ${r1(s.y)}×${r1(needH)})`,
      });
      continue;
    }
    // 지게차로 2단 적재할 때 윗단 화물의 윗면이 도어 헤더에 걸리는 경우
    if (fork && p.pos.z + s.z + cfg.forkliftClearance > space.door.h + cfg.epsilon && p.pos.z > cfg.heightTolerance) {
      out.push({
        code: 'DOOR_HEADER_CLEARANCE',
        severity: 'warning',
        itemIds: [p.item.id],
        message: `${p.item.id}: 윗단 적재 시 도어 헤더 여유 부족. 내부에서 들어올려 적재해야 함`,
      });
    }
  }
  return out;
}

// ───────────────────────── 3. 겹침 ─────────────────────────

/** only를 주면 그 인덱스의 화물이 포함된 쌍만 검사한다 */
export function checkOverlap(ps: Placement[], cfg: Config, only?: number): Violation[] {
  const out: Violation[] = [];
  if (only !== undefined && (!Number.isInteger(only) || only < 0 || only >= ps.length)) return out;
  const boxes = ps.map(boxOf);
  const e = cfg.epsilon;
  for (let i = 0; i < ps.length; i++) {
    // With a candidate index, visit only its pairs, in the original order.
    const start = only === undefined || i === only ? i + 1 : only;
    const end = only === undefined || i === only ? ps.length : only + 1;
    if (start <= i) continue;
    for (let j = start; j < end; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (
        overlap1d(a.x0, a.x1, b.x0, b.x1) > e &&
        overlap1d(a.y0, a.y1, b.y0, b.y1) > e &&
        overlap1d(a.z0, a.z1, b.z0, b.z1) > e
      ) {
        out.push({
          code: 'OVERLAP',
          severity: 'error',
          itemIds: [ps[i].item.id, ps[j].item.id],
          message: `${ps[i].item.id}와 ${ps[j].item.id}가 겹침`,
        });
      }
    }
  }
  return out;
}

// ───────────────────────── 4. 회전 ─────────────────────────

export function checkOrientation(ps: Placement[]): Violation[] {
  const out: Violation[] = [];
  for (const p of ps) {
    if (!allowedOrientations(p.item).includes(p.orientation)) {
      out.push({
        code: 'ORIENTATION_NOT_ALLOWED',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 회전 ${p.orientation}은 허용되지 않음`,
      });
    }
  }
  return out;
}

// ───────────────────────── 5. 지지 ─────────────────────────

/** 각 화물을 바로 아래에서 받치는 화물의 인덱스와 접촉 면적 */
export function supportersOf(ps: Placement[], cfg: Config, only?: number): { index: number; area: number }[][] {
  const boxes = ps.map(boxOf);
  return boxes.map((b, i) => {
    const list: { index: number; area: number }[] = [];
    if (only !== undefined && i !== only) return list;
    if (b.z0 <= cfg.heightTolerance) return list;
    for (let j = 0; j < boxes.length; j++) {
      if (j === i) continue;
      if (Math.abs(boxes[j].z1 - b.z0) > cfg.heightTolerance) continue;
      const area = overlapXY(b, boxes[j]);
      if (area > 0) list.push({ index: j, area });
    }
    return list;
  });
}

export function checkSupport(ps: Placement[], cfg: Config, only?: number): Violation[] {
  const out: Violation[] = [];
  const boxes = ps.map(boxOf);
  const sup = supportersOf(ps, cfg, only);
  ps.forEach((p, i) => {
    if (only !== undefined && i !== only) return;
    const b = boxes[i];
    if (b.z0 <= cfg.heightTolerance) return; // 바닥에 놓인 화물
    const baseArea = (b.x1 - b.x0) * (b.y1 - b.y0);
    const supported = sup[i].reduce((s, x) => s + x.area, 0);
    const ratio = supported / baseArea;
    if (ratio + 1e-9 < cfg.minSupportRatio) {
      out.push({
        code: sup[i].length === 0 ? 'FLOATING' : 'INSUFFICIENT_SUPPORT',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 지지율 ${r1(ratio * 100)}% (기준 ${cfg.minSupportRatio * 100}%)`,
        value: ratio,
        limit: cfg.minSupportRatio,
      });
      return;
    }
    // 무게중심 투영점이 지지 영역의 외곽 사각형 안에 있는지 (볼록 껍질의 보수적 근사가 아니라
    // 느슨한 근사이므로 지지율 기준과 함께 쓴다)
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const s of sup[i]) {
      const o = boxes[s.index];
      sx0 = Math.min(sx0, Math.max(b.x0, o.x0));
      sx1 = Math.max(sx1, Math.min(b.x1, o.x1));
      sy0 = Math.min(sy0, Math.max(b.y0, o.y0));
      sy1 = Math.max(sy1, Math.min(b.y1, o.y1));
    }
    const cg = itemCg(p);
    if (cg.x < sx0 || cg.x > sx1 || cg.y < sy0 || cg.y > sy1) {
      out.push({
        code: 'CG_OUTSIDE_SUPPORT',
        severity: 'error',
        itemIds: [p.item.id],
        message: `${p.item.id}: 무게중심이 지지 영역 밖에 있음`,
      });
    }
  });
  return out;
}

// ───────────────────────── 6·7. 적층 ─────────────────────────

export interface LoadResult {
  /** 각 화물이 위에서 받는 누적 하중 kg */
  carried: number[];
  /** 각 화물이 바닥에 전달하는 하중 kg (바닥에 놓인 화물만 0보다 큼) */
  floorLoad: number[];
  /** 각 화물의 단 (바닥 = 1) */
  tier: number[];
}

/** 위에서 아래로 하중을 접촉 면적 비율로 나눠 전달한다 */
export function propagateLoads(ps: Placement[], cfg: Config, preparedSupporters?: ReturnType<typeof supportersOf>): LoadResult {
  const boxes = ps.map(boxOf);
  const sup = preparedSupporters ?? supportersOf(ps, cfg);
  const n = ps.length;
  const carried = new Array<number>(n).fill(0);
  const floorLoad = new Array<number>(n).fill(0);
  const tier = new Array<number>(n).fill(1);

  const topDown = boxes.map((_, i) => i).sort((a, b) => boxes[b].z0 - boxes[a].z0);
  for (const i of topDown) {
    const total = ps[i].item.weight + carried[i];
    if (boxes[i].z0 <= cfg.heightTolerance) {
      floorLoad[i] = total;
      continue;
    }
    const sumArea = sup[i].reduce((s, x) => s + x.area, 0);
    if (sumArea === 0) continue; // 공중 부양. checkSupport가 잡는다
    for (const s of sup[i]) carried[s.index] += (total * s.area) / sumArea;
  }
  const bottomUp = [...topDown].reverse();
  for (const i of bottomUp) {
    for (const s of sup[i]) tier[i] = Math.max(tier[i], tier[s.index] + 1);
  }
  return { carried, floorLoad, tier };
}

export function checkStacking(ps: Placement[], cfg: Config, loads?: LoadResult, preparedSupporters?: ReturnType<typeof supportersOf>): Violation[] {
  const out: Violation[] = [];
  const boxes = ps.map(boxOf);
  const { carried, tier } = loads ?? propagateLoads(ps, cfg);
  // 면압 검사가 필요한 화물이 있을 때만 접촉 관계를 다시 구한다
  const sup = ps.some((p) => p.item.maxTopPressure !== undefined) ? preparedSupporters ?? supportersOf(ps, cfg) : [];

  ps.forEach((p, i) => {
    const it = p.item;
    if (it.maxTopLoad !== undefined && carried[i] > it.maxTopLoad + 1e-6) {
      out.push({
        code: it.maxTopLoad === 0 ? 'NO_STACK_ON_TOP' : 'TOP_LOAD_EXCEEDED',
        severity: 'error',
        itemIds: [it.id],
        message: `${it.id}: 상부 하중 ${r1(carried[i])}kg이 허용 ${it.maxTopLoad}kg 초과`,
        value: carried[i],
        limit: it.maxTopLoad,
      });
    }
    if (it.canBePlacedOnTop === false && boxes[i].z0 > cfg.heightTolerance) {
      out.push({
        code: 'MUST_BE_ON_FLOOR',
        severity: 'error',
        itemIds: [it.id],
        message: `${it.id}: 다른 화물 위에 올릴 수 없는 화물`,
      });
    }
    if (it.maxTier !== undefined && tier[i] > it.maxTier) {
      out.push({
        code: 'TIER_EXCEEDED',
        severity: 'error',
        itemIds: [it.id],
        message: `${it.id}: ${tier[i]}단에 놓임 (최대 ${it.maxTier}단)`,
        value: tier[i],
        limit: it.maxTier,
      });
    }
    // 국부 면압: 윗 화물 하나가 이 화물 윗면에 주는 압력
    if (it.maxTopPressure === undefined) return;
    for (let k = 0; k < ps.length; k++) {
      const s = sup[k].find((x) => x.index === i);
      if (!s) continue;
      const sumArea = sup[k].reduce((a, x) => a + x.area, 0);
      const share = ((ps[k].item.weight + carried[k]) * s.area) / sumArea;
      const pressure = share / (s.area / 1e6);
      if (pressure > it.maxTopPressure + 1e-6) {
        out.push({
          code: 'TOP_PRESSURE_EXCEEDED',
          severity: 'error',
          itemIds: [it.id, ps[k].item.id],
          message: `${it.id}: ${ps[k].item.id}의 면압 ${r1(pressure)}kg/m²이 허용 ${it.maxTopPressure}kg/m² 초과`,
          value: pressure,
          limit: it.maxTopPressure,
        });
      }
    }
  });
  return out;
}

// ───────────────────────── 8. 혼적 ─────────────────────────

export function checkSegregation(ps: Placement[], cfg: Config): Violation[] {
  const out: Violation[] = [];
  const byClass = new Map<string, string[]>();
  const zones = new Map<string, string[]>();
  for (const p of ps) {
    if (p.item.segregationClass) {
      const l = byClass.get(p.item.segregationClass) ?? [];
      l.push(p.item.id);
      byClass.set(p.item.segregationClass, l);
    }
    if (p.item.tempZone) {
      const l = zones.get(p.item.tempZone) ?? [];
      l.push(p.item.id);
      zones.set(p.item.tempZone, l);
    }
  }
  for (const [a, b] of cfg.incompatiblePairs) {
    const ia = byClass.get(a);
    const ib = byClass.get(b);
    if (ia && ib) {
      out.push({
        code: 'INCOMPATIBLE_CARGO',
        severity: 'error',
        itemIds: [...ia, ...ib],
        message: `혼적 금지: ${a} 그룹과 ${b} 그룹이 같은 공간에 있음`,
      });
    }
  }
  if (zones.size > 1) {
    out.push({
      code: 'MIXED_TEMP_ZONE',
      severity: 'error',
      itemIds: [...zones.values()].flat(),
      message: `온도대가 다른 화물이 섞임: ${[...zones.keys()].join(', ')}`,
    });
  }
  return out;
}

// ───────────────────────── 9. 하역 순서 ─────────────────────────

/**
 * 먼저 내릴 화물 A를 나중에 내릴 화물 B가 막는지 검사한다.
 * 위에 얹힌 화물은 항상 막는다. 수평 방향은 열려 있는 접근면 중 하나라도
 * 막히지 않았으면 통과로 본다. 'top' 접근(크레인)이 있으면 수평 막힘은 보지 않는다.
 */
export function checkUnloadOrder(ps: Placement[], space: Space, cfg: Config, only?: number): Violation[] {
  const out: Violation[] = [];
  const boxes = ps.map(boxOf);
  const tol = cfg.heightTolerance;
  const e = cfg.epsilon;
  const severity = cfg.strictUnloadOrder ? 'error' : 'warning';
  const sides = space.access.filter((s) => s !== 'top');
  const topAccess = space.access.includes('top');

  for (let i = 0; i < ps.length; i++) {
    const sa = ps[i].item.stopSeq;
    if (sa === undefined) continue;
    const a = boxes[i];
    const blockedBy = new Map<string, Set<number>>();
    const above = new Set<number>();

    const js = only !== undefined && i !== only ? [only] : null;
    for (let jj = 0; jj < (js ? 1 : ps.length); jj++) {
      const j = js ? js[0] : jj;
      const sb = ps[j].item.stopSeq;
      if (j === i || sb === undefined || sb <= sa) continue;
      const b = boxes[j];
      const xy = overlap1d(a.x0, a.x1, b.x0, b.x1) > e && overlap1d(a.y0, a.y1, b.y0, b.y1) > e;
      const yz = overlap1d(a.y0, a.y1, b.y0, b.y1) > e && overlap1d(a.z0, a.z1, b.z0, b.z1) > e;
      const xz = overlap1d(a.x0, a.x1, b.x0, b.x1) > e && overlap1d(a.z0, a.z1, b.z0, b.z1) > e;
      if (b.z0 >= a.z1 - tol && xy) above.add(j);
      const mark = (side: string): void => {
        const s = blockedBy.get(side) ?? new Set<number>();
        s.add(j);
        blockedBy.set(side, s);
      };
      if (b.x0 >= a.x1 - e && yz) mark('rear');
      if (b.y1 <= a.y0 + e && xz) mark('left');
      if (b.y0 >= a.y1 - e && xz) mark('right');
    }

    if (above.size > 0) {
      out.push({
        code: 'UNLOAD_BLOCKED_ABOVE',
        severity,
        itemIds: [ps[i].item.id, ...[...above].map((j) => ps[j].item.id)],
        message: `${ps[i].item.id}(착지 ${sa}) 위에 나중에 내릴 화물이 있음`,
      });
    }
    if (topAccess || sides.length === 0) continue;
    const allBlocked = sides.every((s) => (blockedBy.get(s)?.size ?? 0) > 0);
    if (allBlocked) {
      const blockers = new Set<number>();
      for (const s of sides) for (const j of blockedBy.get(s) ?? []) blockers.add(j);
      out.push({
        code: 'UNLOAD_BLOCKED',
        severity,
        itemIds: [ps[i].item.id, ...[...blockers].map((j) => ps[j].item.id)],
        message: `${ps[i].item.id}(착지 ${sa})의 반출 경로가 나중에 내릴 화물에 막힘`,
      });
    }
  }
  return out;
}

// ───────────────────────── 10. 중량과 선하중 ─────────────────────────

export function totalWeight(ps: Placement[]): number {
  return ps.reduce((s, p) => s + p.item.weight, 0);
}

/** X 방향으로 훑어 가장 큰 선하중(kg/m)과 그 위치를 구한다 */
export function maxLineLoad(ps: Placement[], cfg: Config, loads?: LoadResult): { value: number; x: number } {
  const boxes = ps.map(boxOf);
  const { floorLoad } = loads ?? propagateLoads(ps, cfg);
  const events: { x: number; d: number }[] = [];
  boxes.forEach((b, i) => {
    if (floorLoad[i] <= 0) return;
    const density = floorLoad[i] / ((b.x1 - b.x0) / 1000);
    events.push({ x: b.x0, d: density }, { x: b.x1, d: -density });
  });
  events.sort((a, b) => a.x - b.x || a.d - b.d); // 같은 위치에서는 끝나는 구간을 먼저 처리
  let cur = 0;
  let best = { value: 0, x: 0 };
  for (const ev of events) {
    cur += ev.d;
    if (cur > best.value + 1e-9) best = { value: cur, x: ev.x };
  }
  return best;
}

export function checkWeight(ps: Placement[], space: Space, cfg: Config, loads?: LoadResult): Violation[] {
  const out: Violation[] = [];
  const w = totalWeight(ps);
  const limit = space.maxPayload * cfg.payloadRatio;
  if (w > limit + 1e-6) {
    out.push({
      code: 'PAYLOAD_EXCEEDED',
      severity: 'error',
      itemIds: [],
      message: `화물 총중량 ${r1(w)}kg이 한도 ${r1(limit)}kg 초과`,
      value: w,
      limit,
    });
  }
  if (space.floorLineLoad !== undefined) {
    const m = maxLineLoad(ps, cfg, loads);
    if (m.value > space.floorLineLoad + 1e-6) {
      out.push({
        code: 'LINE_LOAD_EXCEEDED',
        severity: 'error',
        itemIds: [],
        message: `X=${r1(m.x)}mm 부근 선하중 ${r1(m.value)}kg/m이 허용 ${space.floorLineLoad}kg/m 초과. 받침목으로 분산 필요`,
        value: m.value,
        limit: space.floorLineLoad,
      });
    }
  }
  return out;
}

// ───────────────────────── 11. 무게중심과 축하중 ─────────────────────────

export function centerOfGravity(ps: Placement[]): Vec3 | null {
  const w = totalWeight(ps);
  if (w === 0) return null;
  const acc = { x: 0, y: 0, z: 0 };
  for (const p of ps) {
    const c = itemCg(p);
    acc.x += c.x * p.item.weight;
    acc.y += c.y * p.item.weight;
    acc.z += c.z * p.item.weight;
  }
  return { x: acc.x / w, y: acc.y / w, z: acc.z / w };
}

export function checkCog(ps: Placement[], space: Space, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const cg = centerOfGravity(ps);
  if (!cg) return out;
  const { l, w, h } = space.inner;
  // 길이 방향 60:40 규칙은 컨테이너에 적용한다. 트럭은 축하중으로 판정한다.
  if (space.kind === 'container') {
    const dev = Math.abs(cg.x - l / 2);
    const lim = l * cfg.cgLongTolerance;
    if (dev > lim) {
      out.push({
        code: 'CG_LONGITUDINAL',
        severity: 'error',
        itemIds: [],
        message: `길이 방향 무게중심 편차 ${r1(dev)}mm (허용 ±${r1(lim)}mm). ${cg.x > l / 2 ? '도어' : '앞벽'} 쪽으로 쏠림`,
        value: dev,
        limit: lim,
      });
    }
  }
  const devY = Math.abs(cg.y - w / 2);
  const limY = w * cfg.cgLatTolerance;
  if (devY > limY) {
    out.push({
      code: 'CG_LATERAL',
      severity: space.kind === 'container' ? 'error' : 'warning',
      itemIds: [],
      message: `폭 방향 무게중심 편차 ${r1(devY)}mm (허용 ±${r1(limY)}mm). ${cg.y > w / 2 ? '우측' : '좌측'}으로 쏠림`,
      value: devY,
      limit: limY,
    });
  }
  if (cg.z > h * cfg.cgHeightRatio) {
    out.push({
      code: 'CG_HIGH',
      severity: 'warning',
      itemIds: [],
      message: `무게중심 높이 ${r1(cg.z)}mm가 권장 한도 ${r1(h * cfg.cgHeightRatio)}mm 초과`,
      value: cg.z,
      limit: h * cfg.cgHeightRatio,
    });
  }
  return out;
}

export interface AxleLoads {
  front: number;
  rear: number;
  gross: number;
  frontRatio: number;
}

/** 모멘트 평형으로 전축과 후축군 하중을 구한다 */
export function axleLoads(ps: Placement[], space: Space): AxleLoads | null {
  const ax = space.axles;
  if (!ax) return null;
  const w = totalWeight(ps);
  const cg = centerOfGravity(ps);
  const rearAdd = cg ? (w * (cg.x - ax.frontX)) / (ax.rearX - ax.frontX) : 0;
  const front = ax.emptyFront + (w - rearAdd);
  const rear = ax.emptyRear + rearAdd;
  const gross = front + rear;
  return { front, rear, gross, frontRatio: front / gross };
}

export function checkAxles(ps: Placement[], space: Space, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const ax = space.axles;
  const a = axleLoads(ps, space);
  if (!ax || !a) return out;
  const frontLimit = Math.min(ax.maxFront, cfg.legalAxleLoad * (ax.frontAxleCount ?? 1));
  const rearLimit = Math.min(ax.maxRear, cfg.legalAxleLoad * ax.rearAxleCount);
  if (a.front > frontLimit + 1e-6) {
    out.push({
      code: 'FRONT_AXLE_OVERLOAD',
      severity: 'error',
      itemIds: [],
      message: `전축 하중 ${r1(a.front)}kg이 허용 ${frontLimit}kg 초과. 화물을 뒤로 이동`,
      value: a.front,
      limit: frontLimit,
    });
  }
  if (a.rear > rearLimit + 1e-6) {
    out.push({
      code: 'REAR_AXLE_OVERLOAD',
      severity: 'error',
      itemIds: [],
      message: `후축 하중 ${r1(a.rear)}kg이 허용 ${rearLimit}kg 초과. 화물을 앞으로 이동`,
      value: a.rear,
      limit: rearLimit,
    });
  }
  if (a.gross > ax.maxGross + 1e-6) {
    out.push({
      code: 'GROSS_WEIGHT_EXCEEDED',
      severity: 'error',
      itemIds: [],
      message: `총중량 ${r1(a.gross)}kg이 한도 ${ax.maxGross}kg 초과`,
      value: a.gross,
      limit: ax.maxGross,
    });
  }
  if (a.frontRatio < cfg.minFrontAxleRatio) {
    out.push({
      code: 'FRONT_AXLE_TOO_LIGHT',
      severity: 'error',
      itemIds: [],
      message: `전축 하중 비율 ${r1(a.frontRatio * 100)}% (최소 ${cfg.minFrontAxleRatio * 100}%). 조향 불안정`,
      value: a.frontRatio,
      limit: cfg.minFrontAxleRatio,
    });
  }
  return out;
}

// ───────────────────────── 12. 고정 리포트 ─────────────────────────

export interface SecuringItem {
  id: string;
  /** 마찰만으로 부족해 블로킹이나 래싱으로 잡아야 하는 힘 (daN) */
  requiredForce: { forward: number; rearward: number; sideways: number };
  /** 블로킹이나 래싱이 없을 때 전도 가능성 */
  tipping: { forward: boolean; sideways: boolean };
}

export interface SecuringReport {
  items: SecuringItem[];
  /** 가장 뒤 화물과 도어(또는 뒷문) 사이 거리 mm */
  rearGap: number;
  /** X 구간별 폭 방향 빈틈 합계 중 최댓값 mm */
  maxLateralGap: number;
  violations: Violation[];
}

/**
 * 바닥에 놓인 화물 스택별로 필요한 고정력과 전도 가능성을 계산한다.
 * 필요 고정력 = (가속도 계수 − 마찰계수) × 중량. 0 이하면 마찰로 충분하다.
 */
export function securingReport(ps: Placement[], space: Space, cfg: Config): SecuringReport {
  const boxes = ps.map(boxOf);
  const { floorLoad } = propagateLoads(ps, cfg);
  const acc: Accel = cfg.accel;
  const items: SecuringItem[] = [];
  const violations: Violation[] = [];

  ps.forEach((p, i) => {
    const b = boxes[i];
    if (b.z0 > cfg.heightTolerance) return;
    const mu = p.item.friction ?? cfg.defaultFriction;
    const m = floorLoad[i]; // 위에 얹힌 화물까지 포함한 중량
    const force = (a: number): number => Math.max(0, ((a - mu) * m * G) / 10); // daN
    const cg = itemCg(p);
    const hcg = cg.z - b.z0;
    // 전도 조건: a × h_cg > 무게중심에서 전도 축까지의 수평 거리
    const leverX = Math.min(cg.x - b.x0, b.x1 - cg.x);
    const leverY = Math.min(cg.y - b.y0, b.y1 - cg.y);
    const tipping = {
      forward: acc.forward * hcg > leverX,
      sideways: acc.sideways * hcg > leverY,
    };
    items.push({
      id: p.item.id,
      requiredForce: { forward: force(acc.forward), rearward: force(acc.rearward), sideways: force(acc.sideways) },
      tipping,
    });
    if (tipping.forward || tipping.sideways) {
      violations.push({
        code: 'TIPPING_RISK',
        severity: 'warning',
        itemIds: [p.item.id],
        message: `${p.item.id}: ${tipping.sideways ? '측방' : '전방'} 전도 위험. 블로킹 또는 래싱 필요`,
      });
    }
  });

  const maxX = boxes.reduce((m, b) => Math.max(m, b.x1), 0);
  const rearGap = ps.length ? space.inner.l - maxX : 0;
  if (ps.length && rearGap > cfg.gapWarning) {
    violations.push({
      code: 'REAR_GAP',
      severity: 'warning',
      itemIds: [],
      message: `뒤쪽 빈 공간 ${r1(rearGap)}mm. 각목, 에어백, 래싱으로 고정 필요`,
      value: rearGap,
      limit: cfg.gapWarning,
    });
  }

  // 폭 방향 빈틈: 바닥 화물의 X 경계로 구간을 나눠 각 구간의 (폭 − 점유 폭)을 구한다
  const floor = boxes.filter((b) => b.z0 <= cfg.heightTolerance);
  const cuts = [...new Set(floor.flatMap((b) => [b.x0, b.x1]))].sort((a, b) => a - b);
  let maxLateralGap = 0;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const mid = (cuts[k] + cuts[k + 1]) / 2;
    const spans = floor
      .filter((b) => b.x0 < mid && b.x1 > mid)
      .map((b) => [b.y0, b.y1] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    if (spans.length === 0) continue;
    let covered = 0;
    let end = -Infinity;
    for (const [y0, y1] of spans) {
      if (y1 <= end) continue;
      covered += y1 - Math.max(y0, end);
      end = y1;
    }
    maxLateralGap = Math.max(maxLateralGap, space.inner.w - covered);
  }
  if (maxLateralGap > cfg.gapWarning) {
    violations.push({
      code: 'LATERAL_GAP',
      severity: 'warning',
      itemIds: [],
      message: `폭 방향 빈틈 합계 ${r1(maxLateralGap)}mm. 에어백 등으로 채움 필요`,
      value: maxLateralGap,
      limit: cfg.gapWarning,
    });
  }
  return { items, rearGap, maxLateralGap, violations };
}

/**
 * 눌러 묶기(top-over lashing) 필요 개수. EN 12195-1 형태의 식.
 * @param mass kg, mu 마찰계수, a 수평 가속도 계수, stf 스트랩 표준 장력 daN,
 * @param angleDeg 스트랩과 바닥의 각도, fs 안전계수(전방 1.25, 그 외 1.1)
 */
export function topOverLashCount(
  mass: number,
  mu: number,
  a: number,
  stf: number,
  angleDeg = 90,
  fs = a >= 0.8 ? 1.25 : 1.1,
): number {
  if (a <= mu) return 0;
  const massForceDaN = (mass * G) / 10;
  const n = ((a - mu) * massForceDaN * fs) / (2 * mu * Math.sin((angleDeg * Math.PI) / 180) * stf);
  return Math.ceil(n - 1e-9);
}

// ───────────────────────── 통합 ─────────────────────────

export interface StopState {
  /** 이 착지에서 하역을 마친 뒤의 상태 */
  afterStop: number;
  remainingWeight: number;
  cg: Vec3 | null;
  axles: AxleLoads | null;
  violations: Violation[];
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
  metrics: {
    totalWeight: number;
    volumeUtilization: number;
    weightUtilization: number;
    cg: Vec3 | null;
    axles: AxleLoads | null;
    maxLineLoad: number;
    /** 화물 + 공간 자중. 고정재 중량은 별도로 더한다 */
    grossMass: number;
  };
  securing: SecuringReport;
  /** 착지별 하역 후 재검사 결과 */
  stops: StopState[];
}

export function validate(ps: Placement[], space: Space, config: Partial<Config> = {}): ValidationResult {
  const cfg: Config = { ...DEFAULT_CONFIG, ...config };
  const violations: Violation[] = [
    ...checkBounds(ps, space, cfg),
    ...checkDoor(ps, space, cfg),
    ...checkOverlap(ps, cfg),
    ...checkOrientation(ps),
    ...checkSupport(ps, cfg),
    ...checkStacking(ps, cfg),
    ...checkSegregation(ps, cfg),
    ...checkUnloadOrder(ps, space, cfg),
    ...checkWeight(ps, space, cfg),
    ...checkCog(ps, space, cfg),
    ...checkAxles(ps, space, cfg),
  ];
  const securing = securingReport(ps, space, cfg);
  violations.push(...securing.violations);

  // 중간 착지에서 내린 뒤 남은 화물의 지지, 무게중심, 축하중을 다시 본다
  const seqs = [...new Set(ps.map((p) => p.item.stopSeq).filter((s): s is number => s !== undefined))].sort(
    (a, b) => a - b,
  );
  const stops: StopState[] = [];
  for (const s of seqs.slice(0, -1)) {
    const rest = ps.filter((p) => p.item.stopSeq === undefined || p.item.stopSeq > s);
    const v = [...checkSupport(rest, cfg), ...checkAxles(rest, space, cfg)];
    if (space.kind === 'truck') v.push(...checkCog(rest, space, cfg).filter((x) => x.code === 'CG_LATERAL'));
    stops.push({
      afterStop: s,
      remainingWeight: totalWeight(rest),
      cg: centerOfGravity(rest),
      axles: axleLoads(rest, space),
      violations: v,
    });
    for (const x of v) {
      violations.push({ ...x, code: `AFTER_STOP_${x.code}`, message: `착지 ${s} 하역 후: ${x.message}` });
    }
  }

  const w = totalWeight(ps);
  const vol = ps.reduce((s, p) => s + p.item.dims.l * p.item.dims.w * p.item.dims.h, 0);
  const spaceVol = space.inner.l * space.inner.w * space.inner.h;
  return {
    ok: !violations.some((v) => v.severity === 'error'),
    violations,
    metrics: {
      totalWeight: w,
      volumeUtilization: vol / spaceVol,
      weightUtilization: w / space.maxPayload,
      cg: centerOfGravity(ps),
      axles: axleLoads(ps, space),
      maxLineLoad: maxLineLoad(ps, cfg).value,
      grossMass: w + space.tare,
    },
    securing,
    stops,
  };
}

/**
 * 탐색 알고리즘용 증분 검사. 이미 유효한 배치에 화물 하나를 더할 때
 * 그 화물과 관련된 하드 제약만 빠르게 본다. 전체 검사는 validate()로 한다.
 */
export function canPlace(existing: Placement[], candidate: Placement, space: Space, config: Partial<Config> = {}): Violation[] {
  const cfg: Config = { ...DEFAULT_CONFIG, ...config };
  return checkCandidate(existing, candidate, space, cfg);
}

/** One packing pass owns this append-only geometry. Rejected candidates never commit.
 * Load propagation still runs in its original order, preserving rounding and limits.
 * Do not reuse this object after moving, rotating or editing a committed placement.
 */
export function createPackingChecks(space: Space, cfg: Config) {
  const existing: Placement[] = [];
  const boxes: Box[] = [];
  let supporters: ReturnType<typeof supportersOf> = [];
  const extend = (candidate: Placement) => {
    const b = boxOf(candidate), k = existing.length;
    const next = supporters.slice();
    const under: { index: number; area: number }[] = [];
    boxes.forEach((other, i) => {
      const area = overlapXY(b, other);
      if (area <= 0) return;
      if (b.z0 > cfg.heightTolerance && Math.abs(other.z1 - b.z0) <= cfg.heightTolerance) under.push({index:i,area});
      // Retain even unusual thin-item/tolerance contacts in the original graph.
      if (other.z0 > cfg.heightTolerance && Math.abs(b.z1 - other.z0) <= cfg.heightTolerance) next[i] = [...next[i], {index:k,area}];
    });
    next.push(under);
    return next;
  };
  return {
    check(candidate: Placement): Violation[] {
      return checkCandidate(existing, candidate, space, cfg, () => extend(candidate));
    },
    commit(candidate: Placement): void {
      supporters = extend(candidate);
      existing.push(candidate);
      boxes.push(boxOf(candidate));
    },
  };
}

function checkCandidate(existing: Placement[], candidate: Placement, space: Space, cfg: Config,
  prepareSupporters?: () => ReturnType<typeof supportersOf>): Violation[] {
  const all = [...existing, candidate];
  const k = all.length - 1;
  // 값싼 검사에서 걸리면 하중 전파까지 가지 않는다
  const quick = [
    ...checkBounds([candidate], space, cfg),
    ...checkDoor([candidate], space, cfg),
    ...checkOrientation([candidate]),
    ...checkOverlap(all, cfg, k),
    ...checkSupport(all, cfg, k),
    ...checkUnloadOrder(all, space, cfg, k),
  ].filter((v) => v.severity === 'error');
  if (quick.length > 0) return quick;
  const supporters = prepareSupporters?.();
  const loads = propagateLoads(all, cfg, supporters);
  return [...checkStacking(all, cfg, loads, supporters), ...checkWeight(all, space, cfg, loads)].filter((v) => v.severity === 'error');
}
