import { afterEach, describe, expect, it } from 'vitest';
import { candidateIndexes, createFootprintGrid, footprintGridFor, setFootprintGridsEnabledForTests, type Footprint } from './footprintGrid';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const touches = (a: Footprint, x0: number, y0: number, x1: number, y1: number) =>
  a.x <= x1 && a.x + a.length >= x0 && a.y <= y1 && a.y + a.width >= y0;

function randomItems(seed: number, count: number) {
  const r = rng(seed);
  // Mostly grid-aligned so many rectangles share edges exactly; some random and out of bounds.
  return Array.from({ length: count }, (): Footprint => {
    const length = r() < 0.5 ? 0.25 : 0.05 + r() * 1.2;
    const width = r() < 0.5 ? 0.125 : 0.05 + r() * 0.9;
    const x = r() < 0.7 ? Math.round(r() * 48) * 0.25 : -0.5 + r() * 13;
    const y = r() < 0.7 ? Math.round(r() * 18) * 0.125 : -0.3 + r() * 3;
    return { x, y, length, width };
  });
}

afterEach(() => setFootprintGridsEnabledForTests(true));

describe('footprint grid', () => {
  it('returns every touching footprint, ascending and unique, for random and edge-sharing queries', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const items = randomItems(seed, 300);
      const grid = createFootprintGrid(items)!;
      expect(grid).not.toBeNull();
      const queries = [...items.map(item => [item.x, item.y, item.x + item.length, item.y + item.width]),
        ...randomItems(seed + 100, 50).map(item => [item.x, item.y, item.x + item.length, item.y + item.width])];
      for (const [x0, y0, x1, y1] of queries) {
        const hit = grid.query(x0, y0, x1, y1)!;
        expect(hit).toEqual([...new Set(hit)].sort((a, b) => a - b));
        const expected = items.flatMap((item, index) => touches(item, x0, y0, x1, y1) ? [index] : []);
        const found = new Set(hit);
        for (const index of expected) expect(found.has(index)).toBe(true);
      }
    }
  });

  it('keeps the superset property when items are inserted incrementally outside the declared extent', () => {
    const items = randomItems(7, 200);
    const grid = createFootprintGrid([], { minX: 0, minY: 0, maxX: 12, maxY: 2.35 })!;
    items.forEach((item, index) => {
      const hit = new Set(grid.query(item.x, item.y, item.x + item.length, item.y + item.width)!);
      for (let j = 0; j < index; j += 1) if (touches(items[j], item.x, item.y, item.x + item.length, item.y + item.width)) expect(hit.has(j)).toBe(true);
      expect(grid.insert(index, item)).toBe(true);
    });
  });

  it('refuses inputs it cannot index and falls back to every index', () => {
    expect(createFootprintGrid([{ x: Number.NaN, y: 0, length: 1, width: 1 }])).toBeNull();
    expect(createFootprintGrid([{ x: 0, y: 0, length: 0, width: 1 }])).toBeNull();
    expect(createFootprintGrid([{ x: 0, y: 0, length: 1, width: 1 }, { x: 1e9, y: 0, length: 1, width: 1 }])).toBeNull();
    const grid = createFootprintGrid(randomItems(3, 60))!;
    expect(grid.query(Number.POSITIVE_INFINITY, 0, 1, 1)).toBeNull();
    expect(candidateIndexes(null, 4, 0, 0, 1, 1)).toEqual([0, 1, 2, 3]);
    expect(candidateIndexes(grid, 3, Number.NaN, 0, 1, 1)).toEqual([0, 1, 2]);
    expect(footprintGridFor(randomItems(3, 10))).toBeNull();
    setFootprintGridsEnabledForTests(false);
    expect(footprintGridFor(randomItems(3, 100))).toBeNull();
  });
});
