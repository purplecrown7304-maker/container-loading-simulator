import { Color } from 'three';
import type { FloorLoadCell } from './engine/floorLoad';

type FloorSize = { length: number; width: number };
const palette = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444'].map(value => new Color(value));

/** Pure, metre-based, Y-up surface shared by both viewers. No resampling. */
export function buildWeightSurfaceGeometry(
  cells: readonly FloorLoadCell[], columns: number, rows: number,
  container: FloorSize, maxHeight: number,
) {
  const nx = columns + 4, ny = rows + 4;
  const positions = new Float32Array(nx * ny * 3), colors = new Float32Array(nx * ny * 3);
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  const grid = new Map(cells.map(cell => [cell.row * columns + cell.column, cell]));
  const maxLoad = Math.max(0, ...cells.map(cell => cell.loadKg));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const column = Math.min(columns - 1, Math.max(0, i - 2));
    const row = Math.min(rows - 1, Math.max(0, j - 2));
    const cell = grid.get(row * columns + column);
    const t = maxLoad > 0 ? Math.max(0, (cell?.loadKg ?? 0) / maxLoad) : 0;
    const outer = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
    // The outer ring shares wall coordinates with the extended edge, closing vertically.
    const x = i <= 1 ? 0 : i >= nx - 2 ? container.length : cell ? cell.x + cell.length / 2 : (column + .5) * container.length / columns;
    const z = j <= 1 ? 0 : j >= ny - 2 ? container.width : cell ? cell.y + cell.width / 2 : (row + .5) * container.width / rows;
    const offset = (j * nx + i) * 3;
    positions.set([x - container.length / 2, outer || t === 0 ? 0 : Math.max(.035, t * maxHeight), z - container.width / 2], offset);
    const band = t <= .34 ? 0 : t <= .67 ? 1 : 2;
    const blend = band === 0 ? t / .34 : band === 1 ? (t - .34) / .33 : (t - .67) / .33;
    palette[band].clone().lerp(palette[band + 1], blend).toArray(colors, offset);
  }
  let offset = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, c = d + 1;
    indices.set([a, d, b, b, d, c], offset); offset += 6;
  }
  return { nx, ny, positions, colors, indices };
}

/** Coordinates are local to the metre-based surface; wall hits belong to edge cells. */
export function weightSurfaceCellIndex(cells: readonly FloorLoadCell[], container: FloorSize, x: number, z: number): number | null {
  const px = x + container.length / 2, py = z + container.width / 2, epsilon = 1e-6;
  const index = cells.findIndex(cell => px >= cell.x - epsilon && py >= cell.y - epsilon
    && (px < cell.x + cell.length || (Math.abs(px - container.length) <= epsilon && Math.abs(cell.x + cell.length - container.length) <= epsilon))
    && (py < cell.y + cell.width || (Math.abs(py - container.width) <= epsilon && Math.abs(cell.y + cell.width - container.width) <= epsilon)));
  return index < 0 ? null : index;
}
