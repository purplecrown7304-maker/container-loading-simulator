/**
 * Exact candidate filter for pairwise placement checks.
 *
 * A uniform XY grid over footprints. `query` returns, in ascending index order, a SUPERSET of
 * every indexed item whose closed footprint rectangle intersects the closed query rectangle
 * (touching edges included). Callers still run their original predicate on each candidate, so
 * the outcome is identical to the brute-force loop; only pairs that cannot satisfy the predicate
 * are skipped.
 *
 * Why it is exact: cell coordinates are `floor((v - origin) / cell)`, a monotone function of v.
 * If two closed intervals share a point m, floor(m) lies inside both cell ranges, so the two
 * rectangles share at least one cell. Ascending order keeps every caller's iteration order (and
 * therefore floating-point summation order) unchanged.
 *
 * The grid is a fixed function of the input (no timing). Whenever an input or a query cannot be
 * indexed safely (non-finite numbers, non-positive sizes, an absurd cell range) the grid is not
 * built or the query returns null, and the caller falls back to its brute-force loop.
 */
export type Footprint = { x: number; y: number; length: number; width: number };

/** Below this size the brute-force loop is already cheap. */
export const FOOTPRINT_GRID_MIN_ITEMS = 48;
const MAX_CELLS_PER_AXIS = 4096;
const MAX_CELLS_TOTAL = 1 << 18;
const MAX_CELLS_PER_QUERY = 1 << 16;

export type FootprintGrid = {
  /** Candidates whose footprint may touch [x0,x1]×[y0,y1]; ascending, unique. null = use brute force. */
  query: (x0: number, y0: number, x1: number, y1: number) => number[] | null;
  /** Adds an item under the caller's own index. false = the grid can no longer be trusted. */
  insert: (index: number, item: Footprint) => boolean;
};

function finiteFootprint(item: Footprint) {
  return Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.length) && Number.isFinite(item.width)
    && item.length > 0 && item.width > 0;
}

/** 1.5 × the median smaller footprint side, clamped. A fixed function of the input. */
function cellSizeFor(items: Footprint[]) {
  if (!items.length) return 0.5;
  const sides = items.map(item => Math.min(item.length, item.width)).sort((a, b) => a - b);
  return Math.min(2, Math.max(0.05, sides[Math.floor(sides.length / 2)] * 1.5));
}

let gridsEnabled = true;
/** Test hook: false forces every caller onto its brute-force loop (the reference behaviour). */
export function setFootprintGridsEnabledForTests(enabled: boolean) {
  gridsEnabled = enabled;
}

export function createFootprintGrid(
  items: Footprint[],
  bounds?: { minX: number; minY: number; maxX: number; maxY: number; cell?: number },
): FootprintGrid | null {
  if (!gridsEnabled || !items.every(finiteFootprint)) return null;
  // Plain loops: spreading very large arrays into Math.min/max overflows the call stack.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x); minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.length); maxY = Math.max(maxY, item.y + item.width);
  }
  if (bounds) ({ minX, minY, maxX, maxY } = bounds);
  const cell = bounds?.cell ?? cellSizeFor(items);
  if (![minX, minY, maxX, maxY, cell].every(Number.isFinite) || !(cell > 0) || maxX < minX || maxY < minY) return null;
  const spanX = Math.floor((maxX - minX) / cell) + 1;
  const spanY = Math.floor((maxY - minY) / cell) + 1;
  if (spanX > MAX_CELLS_PER_AXIS || spanY > MAX_CELLS_PER_AXIS || spanX * spanY > MAX_CELLS_TOTAL) return null;

  // Items outside the declared extent are clamped into the border cells. Clamping is monotone,
  // so the shared-cell argument above still holds and the result stays a superset.
  const cx = (v: number) => Math.min(spanX - 1, Math.max(0, Math.floor((v - minX) / cell)));
  const cy = (v: number) => Math.min(spanY - 1, Math.max(0, Math.floor((v - minY) / cell)));
  const cells: number[][] = Array.from({ length: spanX * spanY }, () => []);
  let stamp = new Uint32Array(Math.max(16, items.length));
  let generation = 0;
  let broken = false;

  const insert = (index: number, item: Footprint) => {
    if (broken || !finiteFootprint(item) || !Number.isInteger(index) || index < 0) { broken = true; return false; }
    const x0 = cx(item.x), x1 = cx(item.x + item.length), y0 = cy(item.y), y1 = cy(item.y + item.width);
    for (let i = x0; i <= x1; i += 1) for (let j = y0; j <= y1; j += 1) cells[i * spanY + j].push(index);
    if (index >= stamp.length) {
      const grown = new Uint32Array(Math.max(index + 1, stamp.length * 2));
      grown.set(stamp);
      stamp = grown;
    }
    return true;
  };

  for (let index = 0; index < items.length; index += 1) if (!insert(index, items[index])) return null;

  const query = (qx0: number, qy0: number, qx1: number, qy1: number) => {
    if (broken || ![qx0, qy0, qx1, qy1].every(Number.isFinite)) return null;
    const x0 = cx(Math.min(qx0, qx1)), x1 = cx(Math.max(qx0, qx1)), y0 = cy(Math.min(qy0, qy1)), y1 = cy(Math.max(qy0, qy1));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS_PER_QUERY) return null;
    generation += 1;
    if (generation === 0xffffffff) { stamp.fill(0); generation = 1; }
    const out: number[] = [];
    for (let i = x0; i <= x1; i += 1) for (let j = y0; j <= y1; j += 1) {
      for (const index of cells[i * spanY + j]) {
        if (stamp[index] === generation) continue;
        stamp[index] = generation;
        out.push(index);
      }
    }
    return out.sort((a, b) => a - b);
  };

  return { query, insert };
}

/** Grid for a full placement list, or null when the brute-force loop should be used. */
export function footprintGridFor(items: Footprint[]): FootprintGrid | null {
  return items.length < FOOTPRINT_GRID_MIN_ITEMS ? null : createFootprintGrid(items);
}

/**
 * Indexes to examine for one query: the grid's candidates, or every index 0..count-1 when no
 * grid exists or the query cannot be answered. Always ascending.
 */
export function candidateIndexes(grid: FootprintGrid | null, count: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const hit = grid?.query(x0, y0, x1, y1);
  if (hit) return hit;
  return Array.from({ length: count }, (_, index) => index);
}
