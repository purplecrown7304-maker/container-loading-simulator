import { describe, expect, it } from 'vitest';
import { compareCandidates, packByHeavyInnerBlocks, heavyInnerLayerLimit } from './heavyInnerBlockPacker';
import { auditLoading } from './loadingAudit';
import { heavyInnerConflictFindings, heavyInnerOrderViolations, usesHeavyInnerLoading } from './heavyInnerPolicy';
import { validateOperationalWeightAndCog } from './operationalValidator';
import { unloadingObstructions } from './operationalQuality';
import type { CargoItem, ContainerSpec, Placement } from './types';

const item = (id: string, weightKg: number, quantity: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .5, width: .5, height: .5, weightKg, quantity, maxStackLayers: 2, maxTopLoadKg: 200, ...overrides,
});
const container: ContainerSpec = { length: 4, width: 1, height: 2, maxPayloadKg: 1000 };

/** Rows from the inner wall to the door: cartons whose X ranges overlap stand in one row.
 * `full` are the leading rows one cargo fills by itself, every row of a cargo with the same
 * number of cartons; `behind` is everything after them. */
function sequenceOf(placements: Placement[]) {
  const rows: Placement[][] = [];
  let end = 0;
  for (const p of [...placements].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)) {
    if (!rows.length || p.x >= end - 1e-6) { rows.push([p]); end = p.x + p.length; }
    else { rows.at(-1)!.push(p); end = Math.max(end, p.x + p.length); }
  }
  const size = new Map<string, number>();
  let lead = 0;
  for (; lead < rows.length; lead++) {
    const row = rows[lead], id = row[0].cargoId;
    if (row.some(p => p.cargoId !== id) || (size.has(id) && size.get(id) !== row.length)) break;
    size.set(id, row.length);
  }
  return { rows, full: rows.slice(0, lead), behind: rows.slice(lead) };
}
const countByCargo = (placements: Placement[]) => { const counts: Record<string, number> = {}; for (const p of placements) counts[p.cargoId] = (counts[p.cargoId] ?? 0) + 1; return counts; };
const top = (row: Placement[]) => Math.max(...row.map(p => p.z + p.height));
/** Floor width a row leaves open between the side walls. */
const openFloor = (space: ContainerSpec, row: Placement[]) => space.width - row.filter(p => p.z < 1e-9).reduce((sum, p) => sum + p.width * p.length, 0) / Math.max(...row.map(p => p.x + p.length - row[0].x));

describe('heavy-inner continuous direct-box work blocks', () => {
  it('keeps deterministic maximum quantity ahead of work-order preference when level loading is selected', () => {
    const cargo = [item('light', 5, 8), item('heavy', 30, 4), item('medium', 10, 6)];
    const first = packByHeavyInnerBlocks(container, cargo, 'capacity');
    expect(first).toEqual(packByHeavyInnerBlocks(container, [...cargo].reverse(), 'capacity'));
    expect(first.placements.length).toBeGreaterThan(4);
    expect(first.placements).toHaveLength(18);
    expect(Math.min(...first.placements.map(p => p.x))).toBe(0);
    expect(auditLoading(container, cargo, first.placements)).toEqual([]);
    // The output itself is a usable SKU work sequence, without returning to a closed SKU.
    const runs = first.placements.map(p => p.cargoId).filter((id, index, ids) => index === 0 || id !== ids[index - 1]);
    expect(runs).toEqual(['heavy', 'medium', 'light']);
  });

  it('keeps explicit strict multi-stop unloading ahead of heavy-first and reports the conflict', () => {
    const cargo = [item('early-heavy', 30, 4, { unloadPriority: 1 }), item('late-light', 5, 4, { unloadPriority: 2 })];
    const spec = { ...container, unloadingPolicy: 'strict' as const };
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements).toHaveLength(8);
    expect(unloadingObstructions(cargo, result.placements)).toBe(0);
    expect(heavyInnerOrderViolations(spec, cargo, result.placements, 'capacity')).toBe(0);
    expect(result.placements[0].cargoId).toBe('late-light');
    expect(heavyInnerConflictFindings(spec, cargo, result.placements, 'capacity').map(f => f.code)).toEqual(['HEAVY_INNER_UNLOAD_CONFLICT']);
  });

  it('does not use total payload or lighter demand to replace an individually heavy box', () => {
    const cargo = [item('heavy', 30, 2), item('light', 5, 10)];
    const result = packByHeavyInnerBlocks({ ...container, maxPayloadKg: 65 }, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'heavy')).toHaveLength(2);
    expect(result.placements.filter(p => p.cargoId === 'light')).toHaveLength(1);
    expect(result.loadedWeightKg).toBe(65);
    expect(result.remaining[0].reasonCode).toBe('PAYLOAD_LIMIT');
  });

  it('keeps a partial load at the inner wall and applies the approved proportional longitudinal CG allowance', () => {
    const cargo = [item('small', 10, 1)];
    const result = packByHeavyInnerBlocks(container, cargo, 'stability');
    expect(result.placements[0].x).toBe(0);
    expect(validateOperationalWeightAndCog(container, result.placements).some(f => f.code === 'CG_LONGITUDINAL')).toBe(false);
  });

  it('does not fill inner side holes with light cargo before unfinished heavier rows', () => {
    const spec = { length: 3, width: 1, height: 1, maxPayloadKg: 1000 };
    const cargo = [item('heavy-wide', 20, 6, { length: .5, width: .6, height: 1, maxStackLayers: 1, allowRotation: false }),
      item('light-narrow', 10, 6, { length: .5, width: .4, height: 1, maxStackLayers: 1, allowRotation: false })];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'heavy-wide')).toHaveLength(6);
    expect(result.placements.filter(p => p.cargoId === 'light-narrow')).toHaveLength(1);
    expect(result.placements.find(p => p.cargoId === 'light-narrow')!.x).toBe(2.5);
    expect(heavyInnerOrderViolations(spec, cargo, result.placements, 'capacity')).toBe(0);
  });

  it.each(['floor', 'top-load', 'stack'] as const)('open-front mixed top reuse never relaxes %s constraints', constraint => {
    const spec = { length: .5, width: .5, height: 1, maxPayloadKg: 1000, ...(constraint === 'floor' ? { floorLoadLimitKgPerM2: 210 } : {}) };
    const cargo = [item('heavy', 50, 1, { ...(constraint === 'top-load' ? { maxTopLoadKg: 0 } : {}), ...(constraint === 'stack' ? { maxStackLayers: 1 } : {}) }), item('light', 5, 1)];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].cargoId).toBe('heavy');
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
  });

  it('preserves pallet and alternative-rule routing', () => {
    expect(usesHeavyInnerLoading(container, [item('pallet', 100, 1, { unitKind: 'pallet' })])).toBe(false);
    expect(usesHeavyInnerLoading({ ...container, rules: { version: 'a-v1', equipmentId: 'custom', kind: 'container', access: ['rear'], source: 'test' } }, [item('box', 10, 1)])).toBe(false);
  });

  it('enforces floor, declared depth, top-load and allowed floor orientations', () => {
    const spec = { ...container, floorLoadLimitKgPerM2: 1500 };
    const dense = item('dense', 19.8, 30, { length: .235, width: .13, height: .265, maxStackLayers: 10, maxTopLoadKg: 100 });
    const medium = { ...dense, id: 'medium', weightKg: 14.6 };
    const floor = item('floor', 7.8, 10, { maxStackLayers: 1, maxTopLoadKg: 0 });
    expect(heavyInnerLayerLimit(spec, dense)).toBe(2);
    expect(heavyInnerLayerLimit(spec, medium)).toBe(3);
    const cargo = [dense, medium, floor, item('fixed', 5, 2, { allowedOrientations: ['LWH'], allowRotation: false })];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
    expect(result.placements.filter(p => p.cargoId === 'floor').every(p => p.z === 0)).toBe(true);
    expect(result.placements.filter(p => p.cargoId === 'fixed').every(p => !p.rotated)).toBe(true);
  });

  it('keeps the full expanded shipment visible even when longitudinal CG remains a verdict error', () => {
    const spec: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, unloadingPolicy: 'strict' };
    const common = { length: .235, width: .13, height: .265, maxStackLayers: 10, maxTopLoadKg: 100 };
    const cargo = [item('PRD001', 19.8, 937, common), item('PRD004', 14.6, 571, common), item('PRD005', 14.6, 14, common), item('PRD006', 14.6, 71, common),
      item('PRD001-PARTIAL', 10.2, 1, common), item('PRD030', 7.8, 138, { ...common, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
      item('PRD030-PARTIAL', 7, 1, { ...common, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
      item('PRD004-PARTIAL', 6.6, 1, common), item('PRD006-PARTIAL', 6.6, 1, common), item('PRD005-PARTIAL', 4.6, 1, common)];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'PRD001')).toHaveLength(937);
    expect(result.placements.filter(p => ['PRD004', 'PRD005', 'PRD006'].includes(p.cargoId))).toHaveLength(656);
    expect(result.loadedWeightKg).toBeLessThanOrEqual(28600);
    // Owner rule 2026-11-19: the rows a cargo fills by itself keep the weight sequence. What
    // could not fill a row stands behind them: fewer cartons of a cargo than one of its rows.
    const { full, behind } = sequenceOf(result.placements);
    expect(full.length).toBeGreaterThan(20);
    expect(heavyInnerOrderViolations(spec, cargo, full.flat(), 'capacity')).toBe(0);
    for (const [id, count] of Object.entries(countByCargo(behind.flat()))) {
      const row = full.find(candidate => candidate[0].cargoId === id);
      if (row) expect(count, id).toBeLessThan(row.length);
    }
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
    expect(validateOperationalWeightAndCog(spec, result.placements)).toContainEqual(expect.objectContaining({ code: 'CG_LONGITUDINAL', severity: 'error' }));
    expect(unloadingObstructions(cargo, result.placements)).toBe(0);
    expect(result.placements.filter(p => p.cargoId.startsWith('PRD030')).every(p => p.z === 0)).toBe(true);
  });
});

describe('leftovers stand in the last rows (owner rule 2026-11-19)', () => {
  /** The shipment the owner reported: four products in three carton sizes, each with one
   * part-filled carton. As built, three heavy cartons stood alone in a row 1.3 m from the
   * inner wall, and a part-filled carton had a row of its own a metre further on. */
  const space: ContainerSpec = { length: 12.032, width: 2.35, height: 2.65, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, unloadingPolicy: 'strict' };
  const carton = (id: string, quantity: number, weightKg: number, length: number, width: number, height: number, maxTopLoadKg: number): CargoItem =>
    ({ id, name: id, quantity, weightKg, length, width, height, maxTopLoadKg, strengthUnverified: false, allowRotation: true } as CargoItem);
  const reported = [
    carton('P014', 93, 22, .26, .24, .225, 40.2), carton('P014-PART', 1, 10.2, .26, .24, .225, 40.2),
    carton('P003', 93, 22, .235, .13, .265, 34.3), carton('P003-PART', 1, 10.2, .235, .13, .265, 34.3),
    carton('P050', 55, 4.2, .235, .31, .265, 42), carton('P050-PART', 1, 2.4, .235, .31, .265, 42),
    carton('G002', 2439, 1.42, .235, .13, .265, 34.3), carton('G002-PART', 1, .62, .235, .13, .265, 34.3)];
  const errors = (container: ContainerSpec, placements: Placement[]) => validateOperationalWeightAndCog(container, placements).filter(finding => finding.severity === 'error');

  it('loads the reported shipment in full rows and gathers what is left over at the door end', () => {
    const before = JSON.stringify(reported);
    const result = packByHeavyInnerBlocks(space, reported, 'stability');
    expect(result.remaining).toEqual([]); expect(result.placements).toHaveLength(2684);
    expect(result.loadedWeightKg).toBeCloseTo(7809.8, 6);
    expect(auditLoading(space, reported, result.placements)).toEqual([]);
    expect(errors(space, result.placements)).toEqual([]);
    const { rows, full, behind } = sequenceOf(result.placements);
    // From the inner wall: only rows one cargo fills wall to wall and to its full height,
    // the heaviest carton first.
    expect(full.map(row => `${row[0].cargoId}x${row.length}`)).toEqual([
      ...Array(5).fill('P014x18'), ...Array(2).fill('P003x36'), 'P050x28', ...Array(33).fill('G002x72')]);
    expect(heavyInnerOrderViolations(space, reported, full.flat(), 'stability')).toBe(0);
    for (const row of full) expect(new Set(row.map(p => Math.round((p.z + p.height) * 1e6)).filter((_, index) => !row.some(q => q !== row[index] && q.x === row[index].x && q.y === row[index].y && q.z > row[index].z))).size).toBe(1);
    // Behind them stands what could not fill a row: 3 and 21 heavy cartons, 27 and 63 lighter
    // ones and the four part-filled cartons.
    expect(countByCargo(behind.flat())).toEqual({ P014: 3, 'P014-PART': 1, P003: 21, 'P003-PART': 1, P050: 27, 'P050-PART': 1, G002: 63, 'G002-PART': 1 });
    expect(Math.min(...behind.flat().map(p => p.x))).toBeCloseTo(Math.max(...full.flat().map(p => p.x + p.length)), 6);
    // No row before the last leaves floor open for even its narrowest carton, and the
    // leftover rows end in the lowest one.
    for (const row of rows.slice(0, -1)) expect(openFloor(space, row)).toBeLessThan(Math.min(...row.map(p => p.width)));
    expect(behind).toHaveLength(3);
    expect(behind.map(top).every((height, index, tops) => index === 0 || height <= tops[index - 1] + 1e-9)).toBe(true);
    expect(top(behind.at(-1)!)).toBeLessThan(top(behind[0]));
    // A part-filled carton lies on its own product, and lighter leftovers fill up the tops
    // of heavier ones of the same size.
    const under = (id: string) => { const p = result.placements.find(q => q.cargoId === id)!; return result.placements.find(q => q.x === p.x && q.y === p.y && Math.abs(q.z + q.height - p.z) < 1e-9)?.cargoId; };
    expect(under('P014-PART')).toBe('P014'); expect(under('P003-PART')).toBe('P003'); expect(under('P050-PART')).toBe('P050');
    expect(behind.flat().filter(p => p.cargoId === 'G002' && p.z > 0 && result.placements.some(q => q.cargoId.startsWith('P003') && q.x === p.x && q.y === p.y)).length).toBeGreaterThan(40);
    // Heavier below in every column, each carton resting on the one under it.
    const columns = new Map<string, Placement[]>();
    for (const p of result.placements) { const key = `${p.x}|${p.y}`; columns.set(key, [...(columns.get(key) ?? []), p]); }
    for (const column of columns.values()) {
      column.sort((a, b) => a.z - b.z);
      for (let i = 1; i < column.length; i++) { expect(column[i].weightKg).toBeLessThanOrEqual(column[i - 1].weightKg); expect(column[i].z).toBeCloseTo(column[i - 1].z + column[i - 1].height, 6); }
    }
    expect(JSON.stringify(reported)).toBe(before);
    expect(packByHeavyInnerBlocks(space, reported, 'stability')).toEqual(result);
  });

  it('keeps a row a cargo cannot fill out of the middle of the load', () => {
    const small: ContainerSpec = { length: 2, width: 1, height: 1.1, maxPayloadKg: 1000 };
    const cargo = [item('heavy', 30, 6), item('light', 10, 8)];
    const result = packByHeavyInnerBlocks(small, cargo, 'capacity');
    const at = (id: string, x: number) => result.placements.filter(p => p.cargoId === id && Math.abs(p.x - x) < 1e-9);
    // One row of the heavy cargo (two columns, two tiers), two rows of the light one, and
    // only then the two heavy cartons that do not make a row.
    expect(result.placements).toHaveLength(14);
    expect(at('heavy', 0)).toHaveLength(4); expect(at('light', .5)).toHaveLength(4); expect(at('light', 1)).toHaveLength(4);
    expect(at('heavy', 1.5)).toHaveLength(2); expect(at('heavy', 1.5).every(p => p.z === 0)).toBe(true);
    expect(auditLoading(small, cargo, result.placements)).toEqual([]);
    expect(errors(small, result.placements)).toEqual([]);
  });

  it('sets a part-filled carton on its own product in the last row', () => {
    const small: ContainerSpec = { length: 2, width: 1, height: 1.1, maxPayloadKg: 1000 };
    const cargo = [item('heavy', 30, 5), item('heavy-part', 12, 1), item('light', 10, 8)];
    const result = packByHeavyInnerBlocks(small, cargo, 'capacity');
    expect(result.placements).toHaveLength(14);
    const last = result.placements.filter(p => Math.abs(p.x - 1.5) < 1e-9).sort((a, b) => a.z - b.z);
    expect(last.map(p => p.cargoId)).toEqual(['heavy', 'heavy-part']);
    expect(last[1]).toMatchObject({ y: last[0].y, z: .5 });
    expect(auditLoading(small, cargo, result.placements)).toEqual([]);
  });

  it('keeps the payload for a heavier leftover that is loaded after lighter rows', () => {
    const tight: ContainerSpec = { length: 2, width: 1, height: 1.1, maxPayloadKg: 200 };
    const cargo = [item('heavy', 30, 5), item('light', 10, 8)];
    const result = packByHeavyInnerBlocks(tight, cargo, 'capacity');
    expect(countByCargo(result.placements)).toEqual({ heavy: 5, light: 5 });
    expect(result.loadedWeightKg).toBe(200);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'light', quantity: 3, reasonCode: 'PAYLOAD_LIMIT' })]);
  });

  it('uses the sequence as built only when taking the leftovers to the back loads less or fails the centre-of-gravity verdict', () => {
    const plan = (signature: string, extra: Partial<Parameters<typeof compareCandidates>[0]> = {}) =>
      ({ signature, counts: [10, 5], cgErrors: 0, cgExcess: 0, voids: 0, sparseTop: false, heightMoment: 1, end: 1, ...extra });
    const order = (...plans: ReturnType<typeof plan>[]) => plans.sort(compareCandidates).map(candidate => candidate.signature);
    // Same cargo, both pass: the leftovers go to the back, whatever the as-built plan saves elsewhere.
    expect(order(plan('as-built', { leftoversInside: true }), plan('settled', { voids: 9, heightMoment: 2 }))).toEqual(['settled', 'as-built']);
    // Loaded quantity and the verdict still come first.
    expect(order(plan('settled', { counts: [10, 4] }), plan('as-built', { leftoversInside: true }))).toEqual(['as-built', 'settled']);
    expect(order(plan('settled', { cgErrors: 1, cgExcess: .2 }), plan('as-built', { leftoversInside: true }))).toEqual(['as-built', 'settled']);
    // Level loading keeps its place: after a weight sequence that passes, before one that does not.
    expect(order(plan('level', { mode: 1 }), plan('as-built', { leftoversInside: true }), plan('settled', { cgErrors: 1 }))).toEqual(['as-built', 'level', 'settled']);
    expect(order(plan('as-built', { leftoversInside: true, cgErrors: 1 }), plan('level', { mode: 1 }), plan('settled', { cgErrors: 1 }))).toEqual(['level', 'settled', 'as-built']);
  });
});
