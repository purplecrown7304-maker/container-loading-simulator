import type { Placement } from './engine/types';

const EPS = 0.00001;
const key = (n: number) => Math.round(n * 100000);
export type ReportZone = { number: number; label: string; start: number; end: number; indices: number[]; levels: number[]; height: number };

function zoneLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${zoneLabel(Math.floor(index / 26) - 1)}${zoneLabel(index % 26)}`;
}

/** Presentation-only partitions: no carton can cross a zone boundary, including bridging upper cartons.
 * Consequently, a support dependency cannot point to a later zone. Within each zone work proceeds by Z.
 * Equal transverse profiles merge up to 1.9 m for a manageable reach; large indivisible spans stay intact.
 */
export function buildReportZones(placements: Placement[]): ReportZone[] {
  const ordered = placements.map((p, index) => ({ p, index })).sort((a, b) => a.p.x - b.p.x || a.p.z - b.p.z || a.p.y - b.p.y || a.p.cargoId.localeCompare(b.p.cargoId));
  const slabs: Array<{ start: number; end: number; indices: number[] }> = [];
  for (const { p, index } of ordered) {
    const last = slabs.at(-1);
    if (last && p.x < last.end - EPS) {
      last.end = Math.max(last.end, p.x + p.length);
      last.indices.push(index);
    } else slabs.push({ start: p.x, end: p.x + p.length, indices: [index] });
  }
  const profile = (slab: typeof slabs[number]) => slab.indices.map(i => {
    const p = placements[i];
    return [p.cargoId, key(p.x - slab.start), key(p.y), key(p.z), key(p.length), key(p.width), key(p.height)].join(':');
  }).sort().join('|');
  const grouped: Array<typeof slabs[number] & { profile: string }> = [];
  for (const slab of slabs) {
    const signature = profile(slab);
    const last = grouped.at(-1);
    if (last && signature === last.profile && Math.abs(last.end - slab.start) < EPS && slab.end - last.start <= 1.9 + EPS) {
      last.end = slab.end;
      last.indices.push(...slab.indices);
    } else grouped.push({ ...slab, indices: [...slab.indices], profile: signature });
  }
  // A highly mixed layout may have hundreds of profiles. Keep the overview legible
  // by joining the narrowest adjacent zones; this only removes safe boundaries.
  while (grouped.length > 12) {
    let closest = 0;
    for (let i = 1; i < grouped.length - 1; i++) {
      if (grouped[i + 1].end - grouped[i].start < grouped[closest + 1].end - grouped[closest].start - EPS) closest = i;
    }
    const left = grouped[closest], right = grouped[closest + 1];
    left.end = right.end; left.indices.push(...right.indices);
    grouped.splice(closest + 1, 1);
  }
  return grouped.map((zone, i) => ({
    number: i + 1, label: zoneLabel(i), start: zone.start, end: zone.end,
    indices: zone.indices.sort((a, b) => placements[a].z - placements[b].z || placements[a].x - placements[b].x || placements[a].y - placements[b].y || placements[a].cargoId.localeCompare(placements[b].cargoId)),
    levels: [...new Set(zone.indices.map(index => key(placements[index].z)))].sort((a, b) => a - b).map(n => n / 100000),
    height: Math.max(...zone.indices.map(index => placements[index].z + placements[index].height)),
  }));
}

export type ReportBlock = Pick<Placement, 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'cargoId'> & { count: number };

/** Only joins touching rectangles of the same SKU at the same height; holes stay visible. */
export function reportBlocks(placements: Placement[], indices: number[]): ReportBlock[] {
  const rows = new Map<string, ReportBlock[]>();
  for (const i of indices) {
    const p = placements[i];
    const rowKey = [p.cargoId, key(p.z), key(p.height), key(p.y), key(p.width)].join(':');
    const row = rows.get(rowKey) ?? [];
    row.push({ ...p, count: 1 });
    rows.set(rowKey, row);
  }
  const strips: ReportBlock[] = [];
  for (const row of rows.values()) {
    const merged: ReportBlock[] = [];
    for (const p of row.sort((a, b) => a.x - b.x)) {
      const last = merged.at(-1);
      if (last && Math.abs(last.x + last.length - p.x) < EPS) { last.length += p.length; last.count += p.count; }
      else merged.push({ ...p });
    }
    strips.push(...merged);
  }
  const columns = new Map<string, ReportBlock[]>();
  for (const p of strips) {
    const columnKey = [p.cargoId, key(p.z), key(p.height), key(p.x), key(p.length)].join(':');
    const column = columns.get(columnKey) ?? [];
    column.push(p); columns.set(columnKey, column);
  }
  const blocks: ReportBlock[] = [];
  for (const column of columns.values()) {
    const merged: ReportBlock[] = [];
    for (const p of column.sort((a, b) => a.y - b.y)) {
      const last = merged.at(-1);
      if (last && Math.abs(last.y + last.width - p.y) < EPS) { last.width += p.width; last.count += p.count; }
      else merged.push({ ...p });
    }
    blocks.push(...merged);
  }
  return blocks.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}
