import { afterEach, describe, expect, it } from 'vitest';
import type { Placement } from './engine/types';
import { buildWorkInstructionAddresses } from './engine/workInstructionAddresses';
import { reportFixture } from './reportZones.fixture';
import { buildReportZones } from './reportZones';
import { setUiLanguage } from './uiLanguage';
import { formatWorkOrder3dDimensionLabels, workOrder3dDimensionLegend, workOrder3dDimensions } from './workOrder3dDimensions';

const box = (x: number, y: number, z = 0, extra: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x, y, z, length: 1, width: 1, height: 1, weightKg: 1, ...extra });
const block = (rows: number, columns: number, layers: number) => Array.from({ length: rows * columns * layers }, (_, i) => box(Math.floor(i / columns) % rows, i % columns, Math.floor(i / (rows * columns))));
afterEach(() => setUiLanguage('ko'));

describe('presentation-only 3D work-order dimensions', () => {
  it.each([[8, 18, 2], [2, 3, 4], [1, 1, 1], [5, 2, 3]])('derives %i rows / %i columns / %i tiers from actual placements', (rows, columns, layers) => {
    const placements = block(rows, columns, layers);
    const result = workOrder3dDimensions(placements)!;
    expect(result).toMatchObject({ rows, columns, layers, quantity: rows * columns * layers, regular: true,
      rowCountRange: [rows, rows], columnCountRange: [columns, columns],
      bounds: { x: 0, y: 0, z: 0, length: rows, width: columns, height: layers } });
    expect(formatWorkOrder3dDimensionLabels(result)).toEqual({ row: `${rows}행`, column: `${columns}열`, layer: `${layers}단` });
  });

  it('distinguishes selected-zone counts from global location ranges and preserves all 895 cartons', () => {
    const { result } = reportFixture();
    const before = JSON.stringify(result);
    const zones = buildReportZones(result.placements);
    const summaries = zones.map(zone => workOrder3dDimensions(result.placements, zone.indices)!);
    expect(summaries.reduce((total, summary) => total + summary.quantity, 0)).toBe(895);
    expect(summaries[0]).toMatchObject({ rows: 8, columns: 18, layers: 2, quantity: 288, regular: true, rowRange: [1, 8] });
    expect(summaries[1]).toMatchObject({ rows: 8, columns: 18, layers: 2, quantity: 288, regular: false, rowRange: [9, 16] });
    const tail = summaries.at(-1)!;
    expect(tail).toMatchObject({ rows: 1, columns: 10, layers: 2, quantity: 19, regular: false,
      rowRange: [32, 32], columnRange: [1, 10], columnCountRange: [9, 10] });
    expect(formatWorkOrder3dDimensionLabels(tail)).toEqual({ row: '최대 1행', column: '최대 10열', layer: '2단' });
    const addresses = buildWorkInstructionAddresses(result.placements);
    const upperTail = zones.at(-1)!.indices.filter(index => result.placements[index].z > 0);
    expect(upperTail.map(index => addresses[index].column).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(workOrder3dDimensions(result.placements, upperTail)).toMatchObject({ rows: 1, columns: 9, layers: 1, rowRange: [32, 32], columnRange: [2, 10], layerRange: [2, 2] });
    expect(JSON.stringify(result)).toBe(before);
  });

  it('never infers a full cuboid from its bounding box, an internal hole or a short upper tier', () => {
    const full = block(2, 3, 2);
    for (const [placements, minimumColumns] of [[full.filter((_, i) => i !== 4), 2], [full.slice(0, 10), 1]] as const) {
      const dimensions = workOrder3dDimensions(placements)!;
      expect(dimensions).toMatchObject({ rows: 2, columns: 3, layers: 2, quantity: placements.length, regular: false, columnCountRange: [minimumColumns, 3] });
      expect(dimensions.rows * dimensions.columns * dimensions.layers).toBeGreaterThan(dimensions.quantity);
      expect(workOrder3dDimensionLegend(dimensions)).toContain('빈칸을 채우지 마세요');
    }
    expect(workOrder3dDimensions(full.slice(0, 9))).toMatchObject({ rows: 2, columns: 3, layers: 2, regular: false, rowCountRange: [1, 2] });
  });

  it('does not count the union of staggered row or column origins across tiers as physical rows or columns', () => {
    const placements = [...block(2, 2, 1), ...block(2, 2, 1).map(p => ({ ...p, x: p.x + .25, y: p.y + .5, z: 1 }))];
    expect(workOrder3dDimensions(placements)).toMatchObject({ rows: 2, columns: 2, layers: 2, quantity: 8, regular: false, rowRange: [1, 4] });
    const sameRows = [...block(2, 2, 1), ...block(2, 2, 1).map(p => ({ ...p, y: p.y + .5, z: 1 }))];
    expect(workOrder3dDimensions(sameRows)).toMatchObject({ rows: 2, columns: 2, layers: 2, regular: false, columnRange: [1, 4] });
  });

  it('marks mixed SKUs, geometry, orientation and spaced grids as nonregular', () => {
    for (const extra of [{ cargoId: 'B' }, { width: .5 }, { height: .5 }, { rotated: true }, { orientation: 'WLH' as const }]) {
      expect(workOrder3dDimensions([box(0, 0), box(0, 1, 0, extra)])).toMatchObject({ rows: 1, columns: 2, layers: 1, regular: false });
    }
    for (const placements of [[box(0, 0), box(2, 0)], [box(0, 0), box(0, 2)], [box(0, 0), box(0, 0, 2)]]) {
      expect(workOrder3dDimensions(placements)?.regular).toBe(false);
    }
    expect(workOrder3dDimensions(block(2, 3, 2).map(p => ({ ...p, rotated: true })))?.regular).toBe(true);
  });

  it('counts mixed-height and bridging base heights without implying the same vertical stack count', () => {
    const placements = [box(0, 0, 0, { height: .5 }), box(1, 0), box(0, 0, .5, { height: .5 }), box(.5, 0, 1, { length: 1.5 })];
    const dimensions = workOrder3dDimensions(placements)!;
    expect(dimensions).toMatchObject({ rows: 2, columns: 1, layers: 3, quantity: 4, regular: false, rowRange: [1, 3], rowCountRange: [1, 2] });
    expect(workOrder3dDimensionLegend(dimensions)).toContain('서로 다른 박스 바닥 높이');
  });

  it('detects a duplicate placement replacing a missing grid cell', () => {
    const placements = block(2, 2, 1);
    placements[3] = { ...placements[0] };
    expect(workOrder3dDimensions(placements)).toMatchObject({ rows: 2, columns: 2, layers: 1, quantity: 4, regular: false });
  });

  it('deduplicates selected indices, retains holes and supports frozen inputs without mutation', () => {
    const placements = block(3, 3, 2);
    const frozen = Object.freeze(placements.map(p => Object.freeze(p)));
    const indices = Object.freeze([0, 2, 0, 9, 11, -1, 99, NaN, .5]);
    expect(workOrder3dDimensions(frozen, indices)).toMatchObject({ rows: 1, columns: 2, layers: 2, quantity: 4, regular: false, columnRange: [1, 3] });
    expect(indices).toEqual([0, 2, 0, 9, 11, -1, 99, NaN, .5]);
  });

  it('is deterministic under shuffling and invariant under translating the same geometry', () => {
    const placements = block(2, 3, 2);
    const original = workOrder3dDimensions(placements)!;
    expect(workOrder3dDimensions([...placements].reverse())).toEqual(original);
    const translated = workOrder3dDimensions(placements.map(p => ({ ...p, x: p.x + 7, y: p.y + 2, z: p.z + .25 })))!;
    expect(translated).toEqual({ ...original, bounds: { ...original.bounds, x: 7, y: 2, z: .25 } });
    const noisy = placements.map((p, i) => ({ ...p, x: p.x + (i % 2) * .0000001, y: p.y + (i % 2) * .0000001, z: p.z + (i % 2) * .0000001 }));
    expect(workOrder3dDimensions(noisy)).toMatchObject({ rows: 2, columns: 3, layers: 2, regular: true });
  });

  it('does not invent dimensions for empty, invalid or overflowing geometry', () => {
    expect(workOrder3dDimensions([])).toBeNull();
    expect(workOrder3dDimensions([box(0, 0)], [])).toBeNull();
    for (const extra of [{ x: NaN }, { y: Infinity }, { z: -Infinity }, { width: 0 }, { height: -1 }, { length: Infinity }, { x: Number.MAX_VALUE, length: Number.MAX_VALUE }]) {
      expect(workOrder3dDimensions([box(0, 0, 0, extra)])).toBeNull();
    }
  });

  it.each(['ko', 'en', 'vi'] as const)('localizes dimension counts and irregular-layout guidance in %s', locale => {
    setUiLanguage(locale);
    const full = workOrder3dDimensions(block(8, 18, 2))!;
    const partial = workOrder3dDimensions(block(8, 18, 2).slice(0, -1))!;
    const expected = {
      ko: { row: '8행', column: '18열', layer: '2단' },
      en: { row: '8 rows', column: '18 columns', layer: '2 tiers' },
      vi: { row: '8 hàng', column: '18 cột', layer: '2 tầng' },
    }[locale];
    expect(formatWorkOrder3dDimensionLabels(full)).toEqual(expected);
    const prefix = { ko: '최대 ', en: 'Up to ', vi: 'Tối đa ' }[locale];
    expect(formatWorkOrder3dDimensionLabels(partial)).toEqual({ row: prefix + expected.row, column: prefix + expected.column, layer: expected.layer });
    const all = Object.values(formatWorkOrder3dDimensionLabels(partial)).join(' ') + workOrder3dDimensionLegend(partial) + workOrder3dDimensionLegend(full);
    const scope = { ko: '회색으로 표시된 이전 구역은 제외합니다', en: 'earlier gray zones are excluded', vi: 'không tính các khu vực trước đó hiển thị màu xám' }[locale];
    expect(workOrder3dDimensionLegend(full)).toContain(scope);
    expect(workOrder3dDimensionLegend(partial)).toContain(scope);
    if (locale !== 'ko') expect(all).not.toMatch(/[가-힣]/);
    expect(all).not.toMatch(/undefined|NaN|\{\d+\}/);
  });

  it('uses singular English units and an explicit locale independently of the UI preference', () => {
    setUiLanguage('vi');
    expect(formatWorkOrder3dDimensionLabels(workOrder3dDimensions([box(0, 0)])!, 'en')).toEqual({ row: '1 row', column: '1 column', layer: '1 tier' });
  });
});
