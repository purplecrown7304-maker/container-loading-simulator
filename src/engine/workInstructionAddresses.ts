/** Presentation addresses only. Does not move cargo or change packing/working order.
 * X origins keep the same row across all tiers; Y origins keep their column within that row.
 * The Three door camera is at +X: high Y is its left, low Y its right.
 */
export type WorkInstructionAddress = { column: number; row: number; layer: number };
const EPS = 1e-6;
const clusters = (values: readonly number[]) => [...values].sort((a, b) => a - b).reduce<number[]>((out, value) => {
  if (!out.length || value - out[out.length - 1] > EPS) out.push(value);
  return out;
}, []);
const rank = (values: readonly number[], value: number) => values.findIndex(v => Math.abs(v - value) <= EPS) + 1;
export function buildWorkInstructionAddresses(placements: readonly { x: number; y: number; z: number }[]): WorkInstructionAddress[] {
  const levels = clusters(placements.map(p => p.z));
  const rows = clusters(placements.map(p => p.x));
  const assignedRows = placements.map(p => rank(rows, p.x));
  const columns = rows.map((_, row) => clusters(placements.filter((_, i) => assignedRows[i] === row + 1).map(p => p.y)).reverse());
  return placements.map((p, i) => ({ column: rank(columns[assignedRows[i] - 1], p.y), row: assignedRows[i], layer: rank(levels, p.z) }));
}
