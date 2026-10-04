import { test, expect } from 'vitest';
const assert = {
  equal: (actual: unknown, expected: unknown) => expect(actual).toBe(expected),
  deepEqual: (actual: unknown, expected: unknown) => expect(actual).toEqual(expected),
  ok: (value: unknown, message?: string) => expect(Boolean(value), message).toBe(true),
};
import { CONTAINERS, TRUCKS, pack, boxOf, propagateLoads, DEFAULT_CONFIG } from './index';
import type { Item } from './index';

const pallets = (n: number, o: Partial<Item> = {}, prefix = 'P'): Item[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`, type: 'pallet' as const, dims: { l: 1100, w: 1100, h: 1100 }, weight: 1000, ...o,
  }));
const cartons = (n: number, dims: Item['dims'], weight: number, o: Partial<Item> = {}, prefix = 'C'): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, type: 'carton' as const, dims, weight, ...o }));
const errs = (r: { validation: { violations: { severity: string; code: string }[] } }) =>
  r.validation.violations.filter((v) => v.severity === 'error').map((v) => v.code);

test('40GP에 T11 20장: 전부 적재, 오류 없음', () => {
  const r = pack(pallets(20), CONTAINERS['40GP']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  assert.equal(r.shiftX, 0);
});

test('40GP에 T11 10장: 무게중심을 맞추려고 도어 쪽으로 이동', () => {
  const r = pack(pallets(10), CONTAINERS['40GP']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  assert.ok(r.shiftX > 0);
  const off = pack(pallets(10), CONTAINERS['40GP'], { centerCargo: false });
  assert.ok(errs(off).includes('CG_LONGITUDINAL'));
});

test('공간 초과분은 미적재로 남고 결과는 유효', () => {
  const r = pack(pallets(24, { weight: 500, maxTopLoad: 0 }), CONTAINERS['40GP']);
  assert.equal(r.placements.length, 20);
  assert.equal(r.unplaced.length, 4);
  assert.deepEqual(errs(r), []);
});

test('중량 한도: 20GP에 3톤 파렛트는 선하중 때문에 1열 5장', () => {
  const r = pack(pallets(12, { weight: 3000 }), CONTAINERS['20GP']);
  // 2열로 놓으면 선하중 5,455kg/m로 한도 4,500kg/m 초과. 1열 5장만 가능하고 폭 중앙으로 옮겨진다
  assert.equal(r.placements.length, 5);
  assert.deepEqual(errs(r), []);
  assert.ok(r.shiftY > 0);
});

test('40HC 2단 적재: 상부 허용하중 안에서 40장', () => {
  const r = pack(pallets(40, { weight: 500, dims: { l: 1100, w: 1100, h: 1000 }, maxTopLoad: 500 }), CONTAINERS['40HC']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  assert.equal(r.placements.filter((p) => p.pos.z > 0).length, 20);
});

test('적층 금지 파렛트는 2단으로 쌓이지 않음', () => {
  const r = pack(pallets(24, { weight: 500, dims: { l: 1100, w: 1100, h: 1000 }, maxTopLoad: 0 }), CONTAINERS['40HC']);
  assert.equal(r.placements.length, 20);
  assert.ok(r.placements.every((p) => p.pos.z === 0));
});

test('혼합 카톤: 취급 주의 화물 위에는 아무것도 없음', () => {
  const items = [
    ...cartons(60, { l: 600, w: 400, h: 400 }, 18, { maxTopLoad: 90 }, 'H'),
    ...cartons(40, { l: 500, w: 400, h: 300 }, 8, { maxTopLoad: 30 }, 'M'),
    ...cartons(20, { l: 400, w: 300, h: 300 }, 3, { maxTopLoad: 0, thisSideUp: true }, 'F'),
  ];
  const r = pack(items, CONTAINERS['20GP']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  const { carried } = propagateLoads(r.placements, DEFAULT_CONFIG);
  r.placements.forEach((p, i) => { if (p.item.id.startsWith('F')) assert.equal(carried[i], 0); });
});

test('다착지 컨테이너: 하역 순서 위반 없음, 마지막 착지가 앞벽 쪽', () => {
  const items = [
    ...pallets(6, { stopSeq: 1 }, 'S1-'),
    ...pallets(6, { stopSeq: 2 }, 'S2-'),
    ...pallets(6, { stopSeq: 3 }, 'S3-'),
  ];
  const r = pack(items, CONTAINERS['40GP']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  const avgX = (s: number) => {
    const ps = r.placements.filter((p) => p.item.stopSeq === s);
    return ps.reduce((a, p) => a + boxOf(p).x0, 0) / ps.length;
  };
  assert.ok(avgX(3) < avgX(2) && avgX(2) < avgX(1));
});

test('트럭: 5톤 윙바디에 T11 10장, 축하중 통과', () => {
  const r = pack(pallets(10, { weight: 480 }), TRUCKS['5T_WING']);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(errs(r), []);
  assert.ok(r.validation.metrics.axles!.rear <= 10000);
});

test('트럭: 앞쪽에 몰린 중량 파렛트는 전축 과하중을 피하도록 뒤로 이동', () => {
  const items = pallets(4, { weight: 1200, maxTopLoad: 0 });
  const off = pack(items, TRUCKS['5T_WING'], { centerCargo: false });
  assert.ok(errs(off).includes('FRONT_AXLE_OVERLOAD'));
  const on = pack(items, TRUCKS['5T_WING']);
  assert.deepEqual(errs(on), []);
  assert.equal(on.shiftX, 850);
  assert.ok(on.validation.metrics.axles!.front <= 5000);
});
