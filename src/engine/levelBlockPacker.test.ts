import { describe, expect, it } from 'vitest';
import { packByLevelBlocks } from './levelBlockPacker';
import { judgedLevelPlans, packByHeavyInnerBlocks } from './heavyInnerBlockPacker';
import { loadContainer } from './loadingEngine';
import { validateOperationalWeightAndCog } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';

// 40 ft high cube, planned inside the 50 mm ceiling clearance.
const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.65, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };
const published: ContainerSpec = { ...container, height: 2.7, ceilingClearanceM: .05 };
const box = (id: string, quantity: number, height: number, weightKg: number, extra: Partial<CargoItem> = {}): CargoItem =>
  ({ id, name: id, quantity, length: .3, width: .46, height, weightKg, maxStackLayers: 8, maxTopLoadKg: 400, allowRotation: true, ...extra } as CargoItem);
// One heavy floor tier, a few taller cartons and many light ones, all on the same footprint.
const mixed = [box('TAN', 200, .2, 40), box('PINK', 15, .55, 30), box('BLUE', 760, .45, 20)];

/** The shipment reported by the owner on 2026-11-19: two products in the same 235 x 130 x
 * 265 mm carton, one of them 22 kg and the other 1.42 kg, each with one part-filled carton.
 * A carton carries 34.3 kg, so the heavy one stacks two high, and two of them with one
 * light carton (45.42 kg on 0.03055 m2) are at the 1,500 kg/m2 floor limit. */
const carton = (id: string, quantity: number, weightKg: number): CargoItem =>
  ({ id, name: id, quantity, length: .235, width: .13, height: .265, weightKg, maxTopLoadKg: 34.3, strengthUnverified: false, allowRotation: true } as CargoItem);
const reported = [carton('HEAVY', 934, 22), carton('HEAVY-PART', 1, 12.8), carton('LIGHT', 2439, 1.42), carton('LIGHT-PART', 1, .62)];
const reportedSpace = { ...published, unloadingPolicy: 'strict' } as ContainerSpec;

type Stack = { x: number; y: number; boxes: Placement[]; height: number; weightKg: number };
/** Columns from the inner wall to the door, each from the floor up. */
function stacks(placements: Placement[]): Stack[] {
  const byPlace = new Map<string, Placement[]>();
  for (const p of placements) { const key = `${p.x.toFixed(4)}|${p.y.toFixed(4)}`; byPlace.set(key, [...(byPlace.get(key) ?? []), p]); }
  return [...byPlace.values()].map(boxes => { boxes.sort((a, b) => a.z - b.z); const top = boxes.at(-1)!;
    return { x: boxes[0].x, y: boxes[0].y, boxes, height: Math.round((top.z + top.height) * 1e6) / 1e6, weightKg: boxes.reduce((sum, p) => sum + p.weightKg, 0) }; })
    .sort((a, b) => a.x - b.x || a.y - b.y);
}
/** The deepest hole inside the load: how far a column ends below a column that stands
 * further toward the door. Columns of one row stand side by side, not behind one another. */
function deepestHole(columns: Stack[]) {
  const rows = new Map<number, Stack[]>();
  for (const column of columns) rows.set(Math.round(column.x * 1e4), [...(rows.get(Math.round(column.x * 1e4)) ?? []), column]);
  let hole = 0, ahead = 0;
  for (const key of [...rows.keys()].sort((a, b) => b - a)) {
    const row = rows.get(key)!;
    for (const column of row) hole = Math.max(hole, ahead - column.height);
    ahead = Math.max(ahead, ...row.map(column => column.height));
  }
  return hole;
}
const count = (placements: Placement[], id: string) => placements.filter(p => p.cargoId === id).length;
const ids = (column: Stack) => column.boxes.map(p => p.cargoId);

describe('level loading: no hole is left inside the load', () => {
  it('loads the reported shipment with its lower columns at the door end instead of a hole at the inner wall', () => {
    const before = JSON.stringify(reported);
    const result = loadContainer(reportedSpace, reported, { strategy: 'stability', publish: false });
    // Everything is loaded once and passes every check.
    expect(result.remaining).toEqual([]); expect(result.placements).toHaveLength(3375); expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(finding => finding.severity === 'error')).toEqual([]);
    expect(result.loadedWeightKg).toBeCloseTo(934 * 22 + 12.8 + 2439 * 1.42 + .62, 6);
    const columns = stacks(result.placements);
    // Two heavy cartons with one light one are at the floor limit: such a column is three
    // cartons high while the others are four. None of them is in front of a taller column.
    const limited = columns.filter(column => ids(column).filter(id => id === 'HEAVY').length === 2);
    expect(limited.length).toBeGreaterThan(0);
    for (const column of limited) { expect(ids(column)).toEqual(['HEAVY', 'HEAVY', 'LIGHT']); expect(column.weightKg / (.235 * .13)).toBeLessThanOrEqual(1500); }
    expect(deepestHole(columns)).toBeLessThan(1e-9);
    // The inner wall is loaded to the full height, and the lower columns are the last ones toward the door.
    const top = Math.max(...columns.map(column => column.height));
    expect(top).toBeCloseTo(4 * .265, 6);
    for (const column of columns.filter(column => column.x < 1)) expect(column.height).toBeCloseTo(top, 6);
    expect(Math.min(...limited.map(column => column.x))).toBeGreaterThan(9);
    // The void-fill plan no longer reports a step at the inner wall.
    expect((result.voidFillPlan?.fills ?? []).filter(fill => fill.kind !== 'door-face' && fill.x < 9)).toEqual([]);
    // Heavy low and light high in every column, each carton fully on the one below.
    for (const column of columns) for (let i = 1; i < column.boxes.length; i++) {
      expect(column.boxes[i].weightKg).toBeLessThanOrEqual(column.boxes[i - 1].weightKg);
      expect(column.boxes[i].z).toBeCloseTo(column.boxes[i - 1].z + column.boxes[i - 1].height, 6);
    }
    expect(JSON.stringify(reported)).toBe(before);
    // Same input, same plan.
    expect(loadContainer(reportedSpace, reported, { strategy: 'stability', publish: false }).placements).toEqual(result.placements);
  });

  it('keeps every stack exactly as it was built and only changes where it stands', () => {
    const ordered = stacks(packByLevelBlocks(container, mixed, 'capacity', 2).placements);
    const asBuilt = stacks(packByLevelBlocks(container, mixed, 'capacity', 2, 'sequential', { stepDown: false }).placements);
    // As built, the columns with a taller carton stand at the inner wall, 0.35 m below the rest.
    expect(deepestHole(asBuilt)).toBeCloseTo(.35, 6);
    expect(asBuilt.filter(column => ids(column).includes('PINK')).every(column => column.x < 2)).toBe(true);
    // Ordered, the same stacks stand on the same floor places with the tall ones first.
    expect(deepestHole(ordered)).toBeLessThan(1e-9);
    expect(ordered.map(column => `${column.x}|${column.y}`)).toEqual(asBuilt.map(column => `${column.x}|${column.y}`));
    const content = (list: Stack[]) => list.map(column => `${ids(column).join('>')}@${column.height}`).sort();
    expect(content(ordered)).toEqual(content(asBuilt));
    const low = ordered.filter(column => ids(column).includes('PINK'));
    expect(low).toHaveLength(15);
    for (const column of low) { expect(ids(column)).toEqual(['TAN', 'PINK', 'BLUE', 'BLUE']); expect(column.height).toBeCloseTo(1.65, 6); }
    expect(Math.min(...low.map(column => column.x))).toBeGreaterThan(Math.max(...ordered.filter(column => Math.abs(column.height - 2) < 1e-6).map(column => column.x)) - 1e-6);
    expect(count(ordered.flatMap(column => column.boxes), 'BLUE')).toBe(760);
  });

  it('changes nothing for a load that already steps down toward the door', () => {
    // One carton height and no limit in the way: the top tier simply ends toward the door.
    const even = [box('TAN', 200, .45, 40), box('PINK', 15, .45, 30), box('BLUE', 500, .45, 20)];
    const asBuilt = packByLevelBlocks(container, even, 'capacity', 1.8, 'sequential', { stepDown: false }).placements;
    expect(deepestHole(stacks(asBuilt))).toBeLessThan(1e-9);
    expect(packByLevelBlocks(container, even, 'capacity', 1.8).placements).toEqual(asBuilt);
  });

  it('reaches the published direct-box result for mixed carton heights', () => {
    const result = loadContainer(published, mixed, { strategy: 'capacity', publish: false });
    expect(result.remaining).toEqual([]); expect(result.placements).toHaveLength(975); expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(finding => finding.severity === 'error')).toEqual([]);
    expect(deepestHole(stacks(result.placements))).toBeLessThan(1e-9);
  });

  it('keeps a hole inside the load only when that rescues the centre-of-gravity verdict', () => {
    const plan = (name: string, counts: number[], cgErrors: number, heightMoment = 1, cgExcess = cgErrors ? .2 : 0) => ({ name, counts, cgErrors, cgExcess, heightMoment });
    let built = 0;
    const asBuilt = (plans: ReturnType<typeof plan>[]) => () => { built++; return plans; };
    // The best ordered plan passes: the as-built plans are not even made.
    expect(judgedLevelPlans([plan('ordered-fail', [10, 5], 1), plan('ordered-ok', [10, 5], 0)], asBuilt([plan('built-ok', [10, 5], 0, .5)])).map(p => p.name)).toEqual(['ordered-ok', 'ordered-fail']);
    expect(built).toBe(0);
    // Every ordered plan with the whole load fails the verdict: an as-built plan that passes it
    // comes first, and one that fails it too is not a reason to keep the hole.
    const judged = judgedLevelPlans([plan('ordered-fail', [10, 5], 1), plan('ordered-less', [10, 4], 0)], asBuilt([plan('built-ok', [10, 5], 0), plan('built-fail', [10, 5], 1, .5)]));
    expect(built).toBe(1); expect(judged.map(p => p.name)).toEqual(['built-ok', 'ordered-fail', 'ordered-less']);
    // Loaded quantity still comes before the verdict.
    expect(judgedLevelPlans([plan('ordered-all-fail', [10, 5], 1)], asBuilt([plan('built-less-ok', [10, 4], 0)])).map(p => p.name)).toEqual(['ordered-all-fail', 'built-less-ok']);
    expect(judgedLevelPlans([], asBuilt([]))).toEqual([]);
  });

  it('still balances a shorter load over a sweep of payload ratings', () => {
    const cargo = [box('TAN', 120, .2, 40), box('PINK', 15, .55, 30), box('BLUE', 440, .45, 20)];
    const loadedKg = cargo.reduce((sum, item) => sum + item.quantity * item.weightKg, 0);
    for (const ratio of [1, 1.25, 2, 4]) {
      const space: ContainerSpec = { ...container, maxPayloadKg: Math.round(loadedKg * ratio) };
      const chosen = packByHeavyInnerBlocks(space, cargo, 'capacity');
      expect(chosen.placements, `ratio ${ratio}`).toHaveLength(575);
      expect(validateOperationalWeightAndCog(space, chosen.placements).filter(finding => finding.severity === 'error'), `ratio ${ratio}`).toEqual([]);
    }
  });
});
