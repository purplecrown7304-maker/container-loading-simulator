import { describe, expect, it } from 'vitest';
import { buildReportZones, reportBlocks } from './reportZones';
import { reportFixture } from './reportZones.fixture';
import { buildPartialLocations, buildZoneOverview, buildZoneTable } from './reportZoneGraphics';

describe('actual-coordinate work zones', () => {
  it('reconstructs five zones and all 895 cartons without assuming equal layers', () => {
    const { container, cargo, result } = reportFixture();
    const zones = buildReportZones(result.placements);
    expect(zones.map(z => z.indices.length)).toEqual([288, 288, 160, 140, 19]);
    expect(zones.map(z => [Number(z.start.toFixed(2)), Number(z.end.toFixed(2))])).toEqual([[0, 1.88], [1.88, 3.76], [3.76, 4.8], [4.8, 5.71], [5.71, 5.84]]);
    expect(new Set(zones.flatMap(z => z.indices)).size).toBe(895);
    const last = zones.at(-1)!;
    expect(last.indices.filter(i => result.placements[i].z === 0)).toHaveLength(10);
    expect(last.indices.filter(i => result.placements[i].z > 0)).toHaveLength(9);
    const table = buildZoneTable(cargo, result.placements, zones);
    expect(table).toContain('895개');
    const partials = buildPartialLocations(cargo, result.placements, zones);
    expect(partials.match(/잔량 1개/g)).toHaveLength(3);
    expect(partials).toContain('E 구역 · 바닥 +265 mm');
    const top = buildZoneOverview(container, cargo, result.placements, zones);
    expect(top).toContain('도어 앞 여유 60 mm');
    expect(top).toContain('fill="#93c5fd"');
  });

  it('never schedules an upper bridging carton before its supporting zone', () => {
    const { result } = reportFixture();
    const base = result.placements[0];
    const placements = [{ ...base, x: 0, length: 1 }, { ...base, x: 1, length: 1 }, { ...base, x: .5, length: 1, z: .265 }];
    const zones = buildReportZones(placements);
    expect(zones).toHaveLength(1);
    expect(zones[0].indices).toEqual([0, 1, 2]);
    expect(buildReportZones([...placements].reverse()).map(z => [z.start, z.end, z.indices.length])).toEqual([[0, 2, 3]]);
  });

  it('preserves holes and total counts while merging only touching same-SKU rectangles', () => {
    const { result } = reportFixture();
    const blocks = reportBlocks(result.placements, result.placements.map((_, i) => i));
    expect(blocks.reduce((n, p) => n + p.count, 0)).toBe(895);
    expect(blocks.length).toBeLessThan(60);
    expect(blocks.some(p => p.x >= 5.7 && p.z > 0 && p.y + p.width > 2.11501)).toBe(false);
    const original = JSON.stringify(result.placements);
    buildReportZones(result.placements);
    expect(JSON.stringify(result.placements)).toBe(original);
  });

  it('keeps many alternating profiles readable and all placements assigned exactly once', () => {
    const { result } = reportFixture();
    const placements = Array.from({ length: 40 }, (_, i) => ({ ...result.placements[0], cargoId: `SKU-${i % 2}`, x: i * .1, length: .1 }));
    const zones = buildReportZones(placements);
    expect(zones).toHaveLength(12);
    expect(zones.flatMap(z => z.indices).sort((a, b) => a - b)).toEqual(placements.map((_, i) => i));
    expect(buildReportZones([])).toEqual([]);
  });
});
