import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { buildWeightSurfaceGeometry, weightSurfaceCellIndex } from './weightSurfaceGeometry';

const container = { length: 10, width: 4 };
const cells = Array.from({ length: 160 }, (_, index) => ({
  row: Math.floor(index / 20), column: index % 20,
  x: (index % 20) * .5, y: Math.floor(index / 20) * .5,
  length: .5, width: .5, loadKg: index, kgPerM2: index * 4,
}));
const build = () => buildWeightSurfaceGeometry(cells, 20, 8, container, 2);
const centerOffset = (index: number) => ((Math.floor(index / 20) + 2) * 24 + index % 20 + 2) * 3;

describe('weight surface geometry', () => {
  it('has 24 by 12 vertices and two indexed triangles per quad, with a zero-height outer ring', () => {
    const g = build();
    expect([g.nx, g.ny]).toEqual([24, 12]);
    expect(g.positions.length).toBe(24 * 12 * 3);
    expect(g.colors.length).toBe(g.positions.length);
    expect(g.indices.length).toBe(23 * 11 * 6);
    expect(Math.max(...g.indices)).toBe(24 * 12 - 1);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 24; i++) {
      if (i === 0 || i === 23 || j === 0 || j === 11) expect(g.positions[(j * 24 + i) * 3 + 1]).toBe(0);
    }
  });

  it('preserves cell centers and the positive-load bar height formula, while zero load touches the floor', () => {
    const g = build();
    cells.forEach((cell, index) => {
      const offset = centerOffset(index);
      expect(g.positions[offset]).toBeCloseTo(cell.x + .25 - 5);
      expect(g.positions[offset + 2]).toBeCloseTo(cell.y + .25 - 2);
      expect(g.positions[offset + 1]).toBeCloseTo(index === 0 ? 0 : Math.max(.035, cell.loadKg / 159 * 2));
    });
  });

  it('extends the nearest cell height and color to all four walls before closing vertically', () => {
    const g = build();
    for (let j = 1; j < 11; j++) for (let i = 1; i < 23; i++) {
      if (i !== 1 && i !== 22 && j !== 1 && j !== 10) continue;
      const offset = (j * 24 + i) * 3;
      const center = centerOffset(Math.min(7, Math.max(0, j - 2)) * 20 + Math.min(19, Math.max(0, i - 2)));
      expect(g.positions[offset + 1]).toBe(g.positions[center + 1]);
      expect(g.colors.slice(offset, offset + 3)).toEqual(g.colors.slice(center, center + 3));
      if (i === 1 || i === 22) expect(g.positions[offset]).toBe(i === 1 ? -5 : 5);
      if (j === 1 || j === 10) expect(g.positions[offset + 2]).toBe(j === 1 ? -2 : 2);
    }
  });

  it('preserves the blue, green, yellow and red color stops', () => {
    const loads = [0, 34, 67, 100];
    const g = buildWeightSurfaceGeometry(cells.map((cell, i) => ({ ...cell, loadKg: loads[i % 4] })), 20, 8, container, 2);
    ['#2563eb', '#22c55e', '#f59e0b', '#ef4444'].forEach((hex, i) => {
      const offset = centerOffset(i), expected = new Color(hex).toArray();
      expected.forEach((value, axis) => expect(g.colors[offset + axis]).toBeCloseTo(value));
    });
  });

  it('handles empty and all-zero results and is deterministic without mutating input', () => {
    const before = JSON.stringify(cells);
    expect(build()).toEqual(build());
    expect(JSON.stringify(cells)).toBe(before);
    for (const input of [[], cells.map(cell => ({ ...cell, loadKg: 0 }))]) {
      const g = buildWeightSurfaceGeometry(input, 20, 8, container, 2);
      expect([...g.positions, ...g.colors].every(Number.isFinite)).toBe(true);
      expect(g.positions.filter((_, i) => i % 3 === 1).every(value => value === 0)).toBe(true);
    }
  });

  it('maps cell centers, boundaries and wall hits back to the original cell index', () => {
    cells.forEach((cell, index) => expect(weightSurfaceCellIndex(cells, container, cell.x + .25 - 5, cell.y + .25 - 2)).toBe(index));
    expect(weightSurfaceCellIndex(cells, container, -4.5, -1.75)).toBe(1);
    expect(weightSurfaceCellIndex(cells, container, 5, 2)).toBe(159);
    expect(weightSurfaceCellIndex(cells, container, -5, -2)).toBe(0);
    expect(weightSurfaceCellIndex(cells, container, 6, 0)).toBeNull();
    expect(weightSurfaceCellIndex([], container, 0, 0)).toBeNull();
  });
});
