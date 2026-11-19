import { describe, expect, it } from 'vitest';
import { LEVEL_DIP_PROFILE, packByLevelBlocks } from './levelBlockPacker';
import { judgedLevelPlans, packByHeavyInnerBlocks } from './heavyInnerBlockPacker';
import { validateOperationalWeightAndCog } from './operationalValidator';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

// 40 ft high cube, planned inside the 50 mm ceiling clearance: 40 rows of 5 cartons.
const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.65, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };
const box = (id: string, quantity: number, height: number, weightKg: number, extra: Partial<CargoItem> = {}): CargoItem =>
  ({ id, name: id, quantity, length: .3, width: .46, height, weightKg, maxStackLayers: 8, maxTopLoadKg: 400, allowRotation: true, ...extra } as CargoItem);
// One heavy floor tier, a few taller cartons and many light ones, all on the same footprint.
const mixed = (pink: Partial<CargoItem> = {}, blue = 760) => [box('TAN', 200, .2, 40), box('PINK', 15, .55, 30, pink), box('BLUE', blue, .45, 20)];

type Stack = { x: number; y: number; boxes: Placement[]; height: number };
/** Columns from the inner wall to the door, each from the floor up. */
function stacks(placements: Placement[]): Stack[] {
  const byPlace = new Map<string, Placement[]>();
  for (const p of placements) { const key = `${p.x.toFixed(4)}|${p.y.toFixed(4)}`; byPlace.set(key, [...(byPlace.get(key) ?? []), p]); }
  return [...byPlace.values()].map(boxes => { boxes.sort((a, b) => a.z - b.z); const top = boxes.at(-1)!; return { x: boxes[0].x, y: boxes[0].y, boxes, height: Math.round((top.z + top.height) * 1e6) / 1e6 }; })
    .sort((a, b) => a.x - b.x || a.y - b.y);
}
/** How far each column ends below the highest column further toward the door. */
function dips(columns: Stack[]) {
  return columns.map((column, index) => Math.max(0, Math.max(0, ...columns.slice(index + 1).filter(other => other.x > column.x + 1e-6).map(other => other.height)) - column.height));
}
const count = (placements: Placement[], id: string) => placements.filter(p => p.cargoId === id).length;

describe('level loading: no hole is left inside the load that a carton can fill', () => {
  it('tops up the columns that mixed carton heights left low, with the cartons loaded last', () => {
    const cargo = mixed(), before = JSON.stringify(cargo);
    const { placements, remaining, loadedWeightKg } = packByLevelBlocks(container, cargo, 'capacity', 2);
    // Everything is loaded once; nothing is added or dropped.
    expect(remaining).toEqual([]); expect(count(placements, 'TAN')).toBe(200); expect(count(placements, 'PINK')).toBe(15); expect(count(placements, 'BLUE')).toBe(760);
    expect(loadedWeightKg).toBeCloseTo(200 * 40 + 15 * 30 + 760 * 20, 6);
    const columns = stacks(placements);
    // A column with a taller carton would end 0.35 m below its neighbours under the common
    // 2.0 m height (0.2 + 0.55 + 2 x 0.45); it carries a third light carton instead.
    const withPink = columns.filter(column => column.boxes.some(p => p.cargoId === 'PINK'));
    expect(withPink).toHaveLength(15);
    for (const column of withPink) { expect(column.boxes.map(p => p.cargoId)).toEqual(['TAN', 'PINK', 'BLUE', 'BLUE', 'BLUE']); expect(column.height).toBeCloseTo(2.1, 6); }
    // No column is left below the ones toward the door by more than a carton could even out.
    expect(Math.max(...dips(columns))).toBeLessThanOrEqual(.45 / 2 + 1e-9);
    // The cartons came from the far end of the top tier. Against the same load with the
    // top-up kept out by a stack limit, fifteen columns are one carton lower, and they are
    // the ones nearest the door.
    const untouched = stacks(packByLevelBlocks(container, mixed({ maxStackLayers: 3 }), 'capacity', 2).placements);
    const full = (list: Stack[]) => list.filter(column => Math.abs(column.height - 2) < 1e-6);
    const place = (column: Stack) => `${column.x}|${column.y}`, stillFull = new Set(full(columns).map(place));
    const lowered = full(untouched).filter(column => !stillFull.has(place(column)));
    expect(lowered).toHaveLength(15); expect(full(columns)).toHaveLength(full(untouched).length - 15);
    expect(Math.min(...lowered.map(column => column.x))).toBeGreaterThanOrEqual(Math.max(...full(columns).map(column => column.x)) - 1e-6);
    for (const column of lowered) expect(columns.find(other => place(other) === place(column))!.height).toBeCloseTo(1.55, 6);
    // Heavy low, light high in every column, on full support.
    for (const column of columns) {
      for (let i = 1; i < column.boxes.length; i++) {
        expect(column.boxes[i].weightKg).toBeLessThanOrEqual(column.boxes[i - 1].weightKg);
        expect(column.boxes[i].z).toBeCloseTo(column.boxes[i - 1].z + column.boxes[i - 1].height, 6);
      }
      expect(column.height).toBeLessThanOrEqual(container.height + 1e-6);
    }
    expect(JSON.stringify(cargo)).toBe(before);
    // Same input, same plan.
    expect(packByLevelBlocks(container, cargo, 'capacity', 2).placements).toEqual(placements);
  });

  it('leaves the hole when a hard limit keeps the carton out', () => {
    const lowColumns = (cargo: CargoItem[], space = container) => stacks(packByLevelBlocks(space, cargo, 'capacity', 2).placements)
      .filter(column => column.boxes.some(p => p.cargoId === 'PINK'));
    // Stack depth: nothing may stand more than two cartons above the taller carton.
    for (const column of lowColumns(mixed({ maxStackLayers: 3 }))) expect(column.boxes.map(p => p.cargoId)).toEqual(['TAN', 'PINK', 'BLUE', 'BLUE']);
    // Cumulative top load: the taller carton carries two light cartons, not three.
    for (const column of lowColumns(mixed({ maxTopLoadKg: 40 }))) expect(column.boxes.map(p => p.cargoId)).toEqual(['TAN', 'PINK', 'BLUE', 'BLUE']);
    // Ceiling: a third light carton would end at 2.1 m.
    for (const column of lowColumns(mixed(), { ...container, height: 2.05 })) expect(column.height).toBeCloseTo(1.65, 6);
    // And then nothing is taken from the end of the load either: every light carton that is
    // not on a low column stands in a complete tier from the inner wall.
    const kept = stacks(packByLevelBlocks(container, mixed({ maxStackLayers: 3 }), 'capacity', 2).placements);
    const plain = kept.filter(column => !column.boxes.some(p => p.cargoId === 'PINK'));
    expect(plain.reduce((sum, column) => sum + column.boxes.filter(p => p.cargoId === 'BLUE').length, 0)).toBe(760 - 15 * 2);
    for (let i = 1; i < plain.length; i++) if (plain[i].x > plain[i - 1].x + 1e-6) expect(plain[i].height).toBeLessThanOrEqual(plain[i - 1].height + 1e-9);
  });

  it('changes nothing when the cartons are the same height or the step is too small to even out', () => {
    // Same height: the top tier simply ends toward the door; there is no hole inside.
    const even = [box('TAN', 200, .2, 40), box('PINK', 15, .45, 30), box('BLUE', 700, .45, 20)];
    const columns = stacks(packByLevelBlocks(container, even, 'capacity', 2).placements);
    expect(Math.max(...dips(columns))).toBeLessThan(1e-9);
    for (let i = 1; i < columns.length; i++) if (columns[i].x > columns[i - 1].x + 1e-6) expect(columns[i].height).toBeLessThanOrEqual(columns[i - 1].height + 1e-9);
    // A carton 0.04 m taller leaves a 0.04 m step: a carton on top would make it worse.
    const slight = stacks(packByLevelBlocks(container, [box('TAN', 200, .2, 40), box('PINK', 15, .41, 30), box('BLUE', 760, .45, 20)], 'capacity', 2).placements);
    const dipped = dips(slight).filter(value => value > 1e-9);
    expect(dipped.length).toBeGreaterThan(0); expect(Math.max(...dipped)).toBeLessThanOrEqual(.45 / 2);
    expect(LEVEL_DIP_PROFILE.minDipM).toBe(.05);
  });

  it('reaches the published direct-box result: full load, no error, no carton-deep hole near the inner wall', () => {
    const cargo = mixed();
    const result = loadContainer({ ...container, height: 2.7, ceilingClearanceM: .05 }, cargo, { strategy: 'capacity', publish: false });
    expect(result.remaining).toEqual([]); expect(result.placements).toHaveLength(975); expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(finding => finding.severity === 'error')).toEqual([]);
    const columns = stacks(result.placements);
    expect(Math.max(...dips(columns))).toBeLessThanOrEqual(.45 / 2 + 1e-9);
    // What the void-fill plan still reports near the inner wall is a step, not room for a carton.
    const inner = (result.voidFillPlan?.fills ?? []).filter(fill => fill.kind === 'top-void' && fill.x < 3);
    for (const fill of inner) expect(fill.height).toBeLessThan(.45 - 1e-6);
  });

  it('can leave the holes open, which is the plan as it was before', () => {
    const open = stacks(packByLevelBlocks(container, mixed(), 'capacity', 2, 'sequential', { fillDips: false }).placements);
    const low = open.filter(column => column.boxes.some(p => p.cargoId === 'PINK'));
    expect(low).toHaveLength(15);
    for (const column of low) { expect(column.boxes.map(p => p.cargoId)).toEqual(['TAN', 'PINK', 'BLUE', 'BLUE']); expect(column.height).toBeCloseTo(1.65, 6); }
    expect(Math.max(...dips(open))).toBeCloseTo(.35, 6);
  });

  it('keeps a hole open only when that rescues the centre-of-gravity verdict', () => {
    const plan = (name: string, counts: number[], cgErrors: number, heightMoment = 1, cgExcess = cgErrors ? .2 : 0) => ({ name, counts, cgErrors, cgExcess, heightMoment });
    let built = 0;
    const open = (plans: ReturnType<typeof plan>[]) => () => { built++; return plans; };
    // The best filled plan passes: the open plans are not even built.
    expect(judgedLevelPlans([plan('filled-fail', [10, 5], 1), plan('filled-ok', [10, 5], 0)], open([plan('open-ok', [10, 5], 0, .5)])).map(p => p.name)).toEqual(['filled-ok', 'filled-fail']);
    expect(built).toBe(0);
    // Every filled plan with the whole load fails the verdict: an open plan that passes it comes first,
    // and an open plan that fails it too is not a reason to leave the hole.
    const judged = judgedLevelPlans([plan('filled-fail', [10, 5], 1), plan('filled-less', [10, 4], 0)], open([plan('open-ok', [10, 5], 0), plan('open-fail', [10, 5], 1, .5)]));
    expect(built).toBe(1); expect(judged.map(p => p.name)).toEqual(['open-ok', 'filled-fail', 'filled-less']);
    // Loaded quantity still comes before the verdict.
    expect(judgedLevelPlans([plan('filled-all-fail', [10, 5], 1)], open([plan('open-less-ok', [10, 4], 0)])).map(p => p.name)).toEqual(['filled-all-fail', 'open-less-ok']);
    expect(judgedLevelPlans([], open([]))).toEqual([]);
  });

  it('gives the same published plan as before for a load the filled plans balance', () => {
    // A shorter load over a sweep of payload ratings (the allowed deviation scales with
    // payload / loaded weight): the whole load is loaded and the verdict is never failed.
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
