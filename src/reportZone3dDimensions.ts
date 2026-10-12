import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import { reportEscape as esc } from './reportLayout';
import { buildZone3d } from './reportZoneGraphics';
import type { ReportZone } from './reportZones';
import { formatWorkOrder3dDimensionLabels, workOrder3dDimensionLegend, workOrder3dDimensions } from './workOrder3dDimensions';

type Point = readonly [number, number];
const number = (n: number) => n.toFixed(2);

/** Add count dimensions without changing a single original cargo face or its color.
 * The arrows describe the active colored zone, never the earlier gray zones.
 * Their world endpoints follow +X (rows), -Y (door-facing columns), +Z (tiers).
 */
export function buildNumberedZone3d(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[], active?: number): string {
  const original = buildZone3d(container, cargo, placements, zones, active);
  const indices = active === undefined ? undefined : zones.find(zone => zone.number === active)?.indices;
  const dimensions = workOrder3dDimensions(placements, indices);
  if (!dimensions) return original;
  const labels = formatWorkOrder3dDimensionLabels(dimensions);
  const scale = 580 / (container.length + container.width * .65);
  // Deliberately the same orthographic projection as the preserved renderer.
  const project = (x: number, y: number, z: number): Point => [65 + (x + y * .65) * scale, 105 + (x * .28 - y * .5 - z * .8) * scale];
  const { x, y, z, length, width, height } = dimensions.bounds;
  const corner = project(x + length, y + width, z);
  const dimensionsToDraw = [
    { axis: 'row', count: dimensions.rows, label: labels.row, from: project(x, y, z), to: project(x + length, y, z), offset: [0, 54] as Point, labelOffset: [0, 18] as Point, angle: 0 },
    { axis: 'column', count: dimensions.columns, label: labels.column, from: corner, to: project(x + length, y, z), offset: [34, 8] as Point, labelOffset: [18, 16] as Point, angle: -37.57 },
    { axis: 'layer', count: dimensions.layers, label: labels.layer, from: corner, to: project(x + length, y + width, z + height), offset: [74, 0] as Point, labelOffset: [17, 0] as Point, angle: -90 },
  ];
  const box = original.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
  let minX = box[0], minY = box[1], maxX = minX + box[2], maxY = minY + box[3];
  const include = (px: number, py: number, pad = 5) => { minX = Math.min(minX, px - pad); minY = Math.min(minY, py - pad); maxX = Math.max(maxX, px + pad); maxY = Math.max(maxY, py + pad); };
  const overlays = dimensionsToDraw.map(({ axis, count, label, from, to, offset, labelOffset, angle }) => {
    const a: Point = [from[0] + offset[0], from[1] + offset[1]], b: Point = [to[0] + offset[0], to[1] + offset[1]];
    const cx = (a[0] + b[0]) / 2 + labelOffset[0], cy = (a[1] + b[1]) / 2 + labelOffset[1];
    const labelWidth = Math.max(40, Array.from(label).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 13 : 7.5), 0) + 12), labelHeight = 23;
    const radians = angle * Math.PI / 180;
    const halfW = Math.abs(Math.cos(radians)) * labelWidth / 2 + Math.abs(Math.sin(radians)) * labelHeight / 2;
    const halfH = Math.abs(Math.sin(radians)) * labelWidth / 2 + Math.abs(Math.cos(radians)) * labelHeight / 2;
    include(a[0], a[1]); include(b[0], b[1]); include(cx - halfW, cy - halfH); include(cx + halfW, cy + halfH);
    const dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy), ux = dx / distance, uy = dy / distance;
    // Explicit path arrowheads avoid document-global marker IDs in repeated SVGs.
    const tip = (p: Point, sign: number) => `M${number(p[0] + sign * ux * 6 - uy * 3)} ${number(p[1] + sign * uy * 6 + ux * 3)} L${number(p[0])} ${number(p[1])} L${number(p[0] + sign * ux * 6 + uy * 3)} ${number(p[1] + sign * uy * 6 - ux * 3)}`;
    return `<g data-count-axis="${axis}" data-count="${count}" data-regular="${dimensions.regular}" fill="none" stroke="#1d4ed8" stroke-width="1.5"><path d="M${number(from[0])} ${number(from[1])} L${number(a[0])} ${number(a[1])} M${number(to[0])} ${number(to[1])} L${number(b[0])} ${number(b[1])}" stroke="#94a3b8" stroke-width=".8" stroke-dasharray="3 3"/><path data-dimension-line="${axis}" d="M${number(a[0])} ${number(a[1])} L${number(b[0])} ${number(b[1])}"/><path d="${tip(a, 1)} ${tip(b, -1)}"/><g data-label-bounds="${[cx-halfW,cy-halfH,cx+halfW,cy+halfH].map(number).join(' ')}" transform="translate(${number(cx)} ${number(cy)}) rotate(${angle})"><rect x="${-labelWidth/2}" y="${-labelHeight/2}" width="${labelWidth}" height="${labelHeight}" rx="4" fill="white" fill-opacity=".97" stroke="none"/><text x="0" y="4.5" text-anchor="middle" font-size="13" font-weight="800" fill="#1d4ed8" stroke="none">${esc(label)}</text></g></g>`;
  }).join('');
  const result = original.replace(/viewBox="[^"]+"/, `viewBox="${number(minX)} ${number(minY)} ${number(maxX-minX)} ${number(maxY-minY)}"`).replace('</svg>', `<g data-work-order-count-dimensions="true" data-quantity="${dimensions.quantity}">${overlays}</g></svg>`);
  return `${result}<p class="zone-count-legend">${esc(workOrder3dDimensionLegend(dimensions))}</p>`;
}
