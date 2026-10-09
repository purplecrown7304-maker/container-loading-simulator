import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CONTAINERS, TRUCKS, DEFAULT_CONFIG, validate, canPlace, propagateLoads, axleLoads,
  topOverLashCount, maxLineLoad, centerOfGravity,
} from './index';
import type { Item, Placement, Orientation } from './index';

let seq = 0;
const item = (o: Partial<Item> & { dims: Item['dims']; weight: number }): Item => ({
  id: o.id ?? `i${++seq}`, type: 'carton', ...o,
});
const put = (it: Item, x: number, y: number, z: number, orientation: Orientation = 'LWH'): Placement => ({
  item: it, pos: { x, y, z }, orientation,
});
const pallet = (id: string, weight = 1000, h = 1100, extra: Partial<Item> = {}): Item =>
  item({ id, type: 'pallet', dims: { l: 1100, w: 1100, h }, weight, ...extra });
const codes = (r: { violations: { code: string }[] }) => r.violations.map((v) => v.code);
const errors = (r: { violations: { code: string; severity: string }[] }) =>
  r.violations.filter((v) => v.severity === 'error').map((v) => v.code);

function t11Grid(rows: number, weight = 1000): Placement[] {
  const ps: Placement[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) ps.push(put(pallet(`P${r}-${c}`, weight), r * 1100, c * 1100, 0));
  return ps;
}

test('40GP에 T11 파렛트 20장: 오류 없음, 빈틈 경고만', () => {
  const r = validate(t11Grid(10), CONTAINERS['40GP']);
  assert.deepEqual(errors(r), []);
  assert.equal(r.ok, true);
  assert.equal(r.metrics.totalWeight, 20000);
  assert.ok(codes(r).includes('REAR_GAP'));
  assert.equal(r.securing.rearGap, 1032);
  assert.equal(r.securing.maxLateralGap, 152);
  // 파렛트 2장이 나란히: 2 × 1000kg / 1.1m
  assert.ok(Math.abs(r.metrics.maxLineLoad - 1818.18) < 0.1);
});

test('20GP에 T11 11번째 줄은 들어가지 않음', () => {
  const r = validate(t11Grid(6), CONTAINERS['20GP']);
  assert.ok(errors(r).includes('OUT_OF_BOUNDS'));
  assert.deepEqual(errors(validate(t11Grid(5), CONTAINERS['20GP'])), []);
});

test('겹침', () => {
  const r = validate([put(pallet('A'), 0, 0, 0), put(pallet('B'), 500, 500, 0)], CONTAINERS['40GP']);
  assert.ok(errors(r).includes('OVERLAP'));
});

test('도어 높이: 내부에는 들어가도 도어를 못 지나는 파렛트', () => {
  const r = validate([put(pallet('TALL', 500, 2250), 0, 0, 0)], CONTAINERS['40GP']);
  assert.ok(errors(r).includes('DOOR_NOT_PASSABLE'));
  assert.ok(!errors(r).includes('HEIGHT_EXCEEDED'));
  // 같은 화물이 40HC에서는 통과
  assert.ok(!errors(validate([put(pallet('TALL2', 500, 2250), 0, 0, 0)], CONTAINERS['40HC'])).includes('DOOR_NOT_PASSABLE'));
});

test('지지: 공중 부양과 지지율 부족', () => {
  const base = item({ id: 'base', dims: { l: 600, w: 400, h: 400 }, weight: 20 });
  const top = item({ id: 'top', dims: { l: 600, w: 400, h: 400 }, weight: 10 });
  assert.ok(errors(validate([put(base, 0, 0, 0), put(top, 1000, 0, 400)], CONTAINERS['20GP'])).includes('FLOATING'));
  assert.ok(errors(validate([put(base, 0, 0, 0), put(top, 300, 0, 400)], CONTAINERS['20GP'])).includes('INSUFFICIENT_SUPPORT'));
  assert.ok(!errors(validate([put(base, 0, 0, 0), put(top, 0, 0, 400)], CONTAINERS['20GP'])).some((c) => c.includes('SUPPORT') || c === 'FLOATING'));
});

test('하중 전파: 접촉 면적 비율로 분배하고 누적', () => {
  const a = item({ id: 'a', dims: { l: 500, w: 500, h: 300 }, weight: 30, maxTopLoad: 70 });
  const b = item({ id: 'b', dims: { l: 500, w: 500, h: 300 }, weight: 30, maxTopLoad: 100 });
  const mid = item({ id: 'mid', dims: { l: 1000, w: 500, h: 300 }, weight: 100 });
  const top = item({ id: 'top', dims: { l: 1000, w: 500, h: 300 }, weight: 60 });
  const ps = [put(a, 0, 0, 0), put(b, 500, 0, 0), put(mid, 0, 0, 300), put(top, 0, 0, 600)];
  const l = propagateLoads(ps, DEFAULT_CONFIG);
  assert.deepEqual(l.carried, [80, 80, 60, 0]);
  assert.deepEqual(l.floorLoad, [110, 110, 0, 0]);
  assert.deepEqual(l.tier, [1, 1, 2, 3]);
  const r = validate(ps, CONTAINERS['20GP']);
  const v = r.violations.filter((x) => x.code === 'TOP_LOAD_EXCEEDED');
  assert.deepEqual(v.map((x) => x.itemIds[0]), ['a']);
});

test('적층 금지, 단수 제한, 바닥 전용', () => {
  const frag = item({ id: 'frag', dims: { l: 500, w: 500, h: 300 }, weight: 10, maxTopLoad: 0 });
  const x = item({ id: 'x', dims: { l: 500, w: 500, h: 300 }, weight: 5, maxTier: 1 });
  const y = item({ id: 'y', dims: { l: 500, w: 500, h: 300 }, weight: 5, canBePlacedOnTop: false });
  const base = item({ id: 'base', dims: { l: 500, w: 500, h: 300 }, weight: 5 });
  const r = validate([put(frag, 0, 0, 0), put(x, 0, 0, 300), put(base, 600, 0, 0), put(y, 600, 0, 300)], CONTAINERS['20GP']);
  for (const c of ['NO_STACK_ON_TOP', 'TIER_EXCEEDED', 'MUST_BE_ON_FLOOR']) assert.ok(errors(r).includes(c), c);
});

test('회전: 천지무용 화물을 눕히면 오류', () => {
  const it = item({ id: 'up', dims: { l: 600, w: 400, h: 300 }, weight: 10, thisSideUp: true });
  assert.ok(errors(validate([put(it, 0, 0, 0, 'LHW')], CONTAINERS['20GP'])).includes('ORIENTATION_NOT_ALLOWED'));
  assert.ok(!errors(validate([put(it, 0, 0, 0, 'WLH')], CONTAINERS['20GP'])).includes('ORIENTATION_NOT_ALLOWED'));
});

test('하역 순서: 컨테이너는 LIFO, 윙바디는 측면이 열려 있으면 통과', () => {
  const first = pallet('first', 500, 1100, { stopSeq: 1 });
  const last = pallet('last', 500, 1100, { stopSeq: 2 });
  const bad = [put(first, 0, 0, 0), put(last, 1100, 0, 0)];
  const good = [put(last, 0, 0, 0), put(first, 1100, 0, 0)];
  assert.ok(errors(validate(bad, CONTAINERS['20GP'])).includes('UNLOAD_BLOCKED'));
  assert.ok(!errors(validate(good, CONTAINERS['20GP'])).includes('UNLOAD_BLOCKED'));
  assert.ok(!errors(validate(bad, TRUCKS['5T_WING'])).includes('UNLOAD_BLOCKED'));
  // 완화 모드에서는 경고
  const soft = validate(bad, CONTAINERS['20GP'], { strictUnloadOrder: false });
  assert.ok(codes(soft).includes('UNLOAD_BLOCKED') && !errors(soft).includes('UNLOAD_BLOCKED'));
});

test('하역 순서: 나중에 내릴 화물이 위에 있으면 차종과 무관하게 막힘', () => {
  const a = item({ id: 'a', dims: { l: 500, w: 500, h: 300 }, weight: 10, stopSeq: 1 });
  const b = item({ id: 'b', dims: { l: 500, w: 500, h: 300 }, weight: 10, stopSeq: 2 });
  assert.ok(errors(validate([put(a, 0, 0, 0), put(b, 0, 0, 300)], TRUCKS['5T_WING'])).includes('UNLOAD_BLOCKED_ABOVE'));
});

test('총중량 초과', () => {
  // 40GP 적재중량 28,750 kg (대표 결정 2026-10-08). 1,450 kg × 20 = 29,000 kg은 초과, 1,400 kg × 20 = 28,000 kg은 이내.
  assert.ok(errors(validate(t11Grid(10, 1450), CONTAINERS['40GP'])).includes('PAYLOAD_EXCEEDED'));
  assert.ok(!errors(validate(t11Grid(10, 1400), CONTAINERS['40GP'])).includes('PAYLOAD_EXCEEDED'));
});

test('선하중: 20GP에 12톤 기계를 2m 길이로 놓으면 초과, 3m면 통과', () => {
  const m2 = item({ id: 'm2', type: 'machine', dims: { l: 2000, w: 1500, h: 1500 }, weight: 12000 });
  const m3 = item({ id: 'm3', type: 'machine', dims: { l: 3000, w: 1500, h: 1500 }, weight: 12000 });
  assert.equal(maxLineLoad([put(m2, 1950, 400, 0)], DEFAULT_CONFIG).value, 6000);
  assert.ok(errors(validate([put(m2, 1950, 400, 0)], CONTAINERS['20GP'])).includes('LINE_LOAD_EXCEEDED'));
  assert.ok(!errors(validate([put(m3, 1450, 400, 0)], CONTAINERS['20GP'])).includes('LINE_LOAD_EXCEEDED'));
});

test('무게중심: 앞쪽 절반에만 실으면 60:40 위반', () => {
  const r = validate(t11Grid(5), CONTAINERS['40GP']);
  assert.ok(errors(r).includes('CG_LONGITUDINAL'));
  assert.equal(centerOfGravity(t11Grid(5))!.x, 2750);
});

test('축하중: 모멘트 평형 계산과 전축 들림', () => {
  const t = TRUCKS['5T_WING'];
  const load = item({ id: 'load', type: 'pallet', dims: { l: 1000, w: 1000, h: 1000 }, weight: 5000 });
  const mid = axleLoads([put(load, 2600, 675, 0)], t)!; // 무게중심 x = 3100
  assert.ok(Math.abs(mid.rear - (2800 + (5000 * 4400) / 5200)) < 1e-6);
  assert.ok(Math.abs(mid.front + mid.rear - 11000) < 1e-6);
  const back = validate([put(load, 5200, 675, 0)], t); // 무게중심 x = 5700, 후축보다 뒤
  assert.ok(errors(back).includes('FRONT_AXLE_TOO_LIGHT'));
  assert.ok(back.metrics.axles!.front < t.axles!.emptyFront);
});

test('착지별 재검사 결과가 생성됨', () => {
  const a = pallet('a', 2000, 1100, { stopSeq: 1 });
  const b = pallet('b', 2000, 1100, { stopSeq: 2 });
  const r = validate([put(b, 0, 600, 0), put(a, 1100, 600, 0)], TRUCKS['5T_WING']);
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].remainingWeight, 2000);
  assert.ok(r.stops[0].axles!.rear < r.metrics.axles!.rear);
});

test('혼적 금지와 온도대', () => {
  const f = pallet('food', 500, 1100, { segregationClass: 'food', tempZone: 'chilled' });
  const c = pallet('chem', 500, 1100, { segregationClass: 'chemical', tempZone: 'ambient' });
  const r = validate([put(f, 0, 0, 0), put(c, 1100, 0, 0)], CONTAINERS['20GP'], { incompatiblePairs: [['food', 'chemical']] });
  assert.ok(errors(r).includes('INCOMPATIBLE_CARGO'));
  assert.ok(errors(r).includes('MIXED_TEMP_ZONE'));
});

test('전도 위험과 필요 고정력', () => {
  const tall = item({ id: 'tall', type: 'machine', dims: { l: 600, w: 600, h: 2000 }, weight: 300 });
  const r = validate([put(tall, 0, 0, 0)], CONTAINERS['20GP']);
  const s = r.securing.items[0];
  assert.deepEqual(s.tipping, { forward: true, sideways: true });
  // 전방 (0.8 − 0.45) × 300kg × 9.81 / 10
  assert.ok(Math.abs(s.requiredForce.forward - 103.005) < 1e-6);
  const flat = validate([put(pallet('flat'), 0, 0, 0)], CONTAINERS['20GP']).securing.items[0];
  assert.deepEqual(flat.tipping, { forward: false, sideways: false });
});

test('눌러 묶기 개수', () => {
  assert.equal(topOverLashCount(1000, 0.45, 0.8, 400), 2);
  assert.equal(topOverLashCount(1000, 0.6, 0.8, 400), 1);
  assert.equal(topOverLashCount(1000, 0.2, 0.8, 400), 5);
  assert.equal(topOverLashCount(1000, 0.6, 0.5, 400), 0);
});

test('canPlace: 증분 검사', () => {
  const base = [put(pallet('p1'), 0, 0, 0)];
  assert.deepEqual(canPlace(base, put(pallet('p2'), 1100, 0, 0), CONTAINERS['20GP']), []);
  assert.equal(canPlace(base, put(pallet('p3'), 600, 0, 0), CONTAINERS['20GP'])[0].code, 'OVERLAP');
});
