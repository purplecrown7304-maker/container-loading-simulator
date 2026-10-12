import type { Placement } from './engine/types';
import { buildWorkInstructionAddresses } from './engine/workInstructionAddresses';
import { readUiLanguage, type UiLanguage } from './uiLanguage';

export type WorkOrder3dDimensions = {
  /** Counts of actual occupied positions, not the highest work-address number. */
  rows: number;
  columns: number;
  /** Distinct box-base heights, not the number of boxes in a vertical stack. */
  layers: number;
  quantity: number;
  /** True only for a complete, touching, same-SKU/geometry/orientation cuboid. */
  regular: boolean;
  /** Min/max global work-address numbers. Intermediate positions may be empty. */
  rowRange: [number, number];
  columnRange: [number, number];
  layerRange: [number, number];
  /** Occupied rows per selected base height; occupied columns per selected row/base height. */
  rowCountRange: [number, number];
  columnCountRange: [number, number];
  bounds: { x: number; y: number; z: number; length: number; width: number; height: number };
};

const EPS = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) <= EPS;
const extent = (values: readonly number[]): [number, number] => values.reduce<[number, number]>(
  ([low, high], value) => [Math.min(low, value), Math.max(high, value)], [Infinity, -Infinity],
);
const origins = (values: readonly number[]) => [...values].sort((a, b) => a - b).reduce<number[]>((out, value) => {
  if (!out.length || value - out[out.length - 1] > EPS) out.push(value);
  return out;
}, []);
const touching = (values: readonly number[], size: number) => values.every((value, index) => index === 0 || same(value - values[index - 1], size));

/** Presentation-only dimensions for the placements visible in one 3D drawing.
 * Length is the greatest occupied row count at any selected box-base height;
 * width is the greatest occupied column count in any selected row/base height.
 * Counting the union across staggered tiers would overstate both physical counts.
 * The original placements and global work-address numbering are never changed.
 */
export function workOrder3dDimensions(
  placements: readonly Placement[],
  indices: readonly number[] = placements.map((_, index) => index),
): WorkOrder3dDimensions | null {
  const selected = [...new Set(indices)].filter(index => Number.isInteger(index) && index >= 0 && index < placements.length);
  if (!selected.length) return null;
  // Invalid coordinates cannot produce trustworthy work-address numbers. Do not
  // manufacture a count or an arrow endpoint from an invalid review result.
  if (placements.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  const boxes = selected.map(index => placements[index]);
  if (boxes.some(p => ![p.length, p.width, p.height].every(value => Number.isFinite(value) && value > 0))) return null;
  const addresses = buildWorkInstructionAddresses(placements);
  const occupied = selected.map(index => addresses[index]);
  const rowsByLayer = new Map<number, Set<number>>();
  const columnsByRowLayer = new Map<string, Set<number>>();
  for (const address of occupied) {
    const rows = rowsByLayer.get(address.layer) ?? new Set<number>();
    rows.add(address.row); rowsByLayer.set(address.layer, rows);
    const key = `${address.row}/${address.layer}`;
    const columns = columnsByRowLayer.get(key) ?? new Set<number>();
    columns.add(address.column); columnsByRowLayer.set(key, columns);
  }
  const rowCountRange = extent([...rowsByLayer.values()].map(rows => rows.size));
  const columnCountRange = extent([...columnsByRowLayer.values()].map(columns => columns.size));
  const xs = origins(boxes.map(p => p.x)), ys = origins(boxes.map(p => p.y)), zs = origins(boxes.map(p => p.z));
  const first = boxes[0];
  const sameGeometry = boxes.every(p => p.cargoId === first.cargoId
    && same(p.length, first.length) && same(p.width, first.width) && same(p.height, first.height)
    && Boolean(p.rotated) === Boolean(first.rotated) && (p.orientation ?? '') === (first.orientation ?? ''));
  // A cardinality check alone would mistake a duplicate placement plus a missing
  // box for a full grid. Require one actual placement at every selected XYZ cell.
  const cells = new Set(boxes.map(p => [xs, ys, zs].map((axis, i) => axis.findIndex(value => same(value, [p.x, p.y, p.z][i]))).join('/')));
  const regular = sameGeometry && cells.size === boxes.length && boxes.length === xs.length * ys.length * zs.length
    && touching(xs, first.length) && touching(ys, first.width) && touching(zs, first.height);
  const [x] = extent(boxes.map(p => p.x)), [y] = extent(boxes.map(p => p.y)), [z] = extent(boxes.map(p => p.z));
  const [, endX] = extent(boxes.map(p => p.x + p.length));
  const [, endY] = extent(boxes.map(p => p.y + p.width));
  const [, endZ] = extent(boxes.map(p => p.z + p.height));
  if (![endX, endY, endZ, endX - x, endY - y, endZ - z].every(Number.isFinite)) return null;
  return {
    rows: rowCountRange[1], columns: columnCountRange[1], layers: rowsByLayer.size, quantity: boxes.length, regular,
    rowRange: extent(occupied.map(a => a.row)), columnRange: extent(occupied.map(a => a.column)), layerRange: extent(occupied.map(a => a.layer)),
    rowCountRange, columnCountRange,
    bounds: { x, y, z, length: endX - x, width: endY - y, height: endZ - z },
  };
}

/** Standalone localized labels so these count labels cannot be mistaken for
 * formatWorkAddress's location labels (for example, "row 32" versus "1 row"). */
export function formatWorkOrder3dDimensionLabels(dimensions: WorkOrder3dDimensions, locale: UiLanguage = readUiLanguage()): { row: string; column: string; layer: string } {
  const { rows, columns, layers, regular } = dimensions;
  if (locale === 'en') {
    const prefix = regular ? '' : 'Up to ';
    return { row: `${prefix}${rows} ${rows === 1 ? 'row' : 'rows'}`, column: `${prefix}${columns} ${columns === 1 ? 'column' : 'columns'}`, layer: `${layers} ${layers === 1 ? 'tier' : 'tiers'}` };
  }
  if (locale === 'vi') {
    const prefix = regular ? '' : 'Tối đa ';
    return { row: `${prefix}${rows} hàng`, column: `${prefix}${columns} cột`, layer: `${layers} tầng` };
  }
  const prefix = regular ? '' : '최대 ';
  return { row: `${prefix}${rows}행`, column: `${prefix}${columns}열`, layer: `${layers}단` };
}

export function workOrder3dDimensionLegend(dimensions: WorkOrder3dDimensions, locale: UiLanguage = readUiLanguage()): string {
  const common = {
    ko: '화살표는 현재 그림에서 색칠된 화물의 행·열·단 개수만 표시하며, 회색으로 표시된 이전 구역은 제외합니다. 작업표의 위치 번호와 구분하세요. 단은 서로 다른 박스 바닥 높이의 개수이며 수직 박스 개수가 아닙니다.',
    en: 'Arrows count rows, columns and tiers of only the currently colored cargo; earlier gray zones are excluded. These counts differ from work-table location numbers. Tiers count distinct box-base heights, not boxes in a vertical stack.',
    vi: 'Mũi tên chỉ ghi số hàng, cột và tầng của hàng hóa đang được tô màu; không tính các khu vực trước đó hiển thị màu xám. Phân biệt số lượng này với số vị trí trong bảng thao tác. Số tầng là số cao độ đáy thùng khác nhau, không phải số thùng chồng đứng.',
  }[locale];
  if (dimensions.regular) return common;
  return `${common} ${{
    ko: '최대 행은 한 단에서, 최대 열은 같은 행·단에서 센 값입니다. 혼합·엇갈림·빈칸이 있을 수 있으니 세 수를 곱해 수량을 계산하거나 빈칸을 채우지 마세요.',
    en: 'Maximum rows are counted within one tier; maximum columns within one row and tier. Mixed sizes, staggering or gaps may occur: do not multiply these counts to obtain quantity or fill empty positions.',
    vi: 'Số hàng tối đa được đếm trong một tầng; số cột tối đa trong cùng một hàng và tầng. Có thể có kích thước khác nhau, vị trí so le hoặc ô trống: không nhân các số này để tính tổng số thùng và không lấp ô trống.',
  }[locale]}`;
}
