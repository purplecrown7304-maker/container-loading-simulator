import { describe, expect, it } from 'vitest';
import { assessShapeQuality, componentCount, componentCountAllPairs } from './shapeQuality';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.4, maxPayloadKg: 10000 };
const box = (overrides: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.6, width: 0.4, height: 0.4, weightKg: 10, ...overrides });

describe('assessShapeQuality', () => {
  it('does not penalize a compact contiguous block', () => {
    const placements = [
      box({ x: 0, y: 0 }), box({ x: 0, y: 0.4 }), box({ x: 0.6, y: 0 }), box({ x: 0.6, y: 0.4 }),
    ];
    const result = assessShapeQuality(container, placements);
    expect(result.isolatedMiddleBoxes).toBe(0);
    expect(result.fragmentedCargoTypes).toBe(0);
  });

  it('leaves isolated-middle stability to the physics validator', () => {
    const placements = [box({ x: 1.2, y: 1.0 })];
    const result = assessShapeQuality(container, placements);
    expect(result.isolatedMiddleBoxes).toBe(0);
    expect(result.protrudingTowers).toBe(0);
    expect(result.shapePenalty).toBe(0);
    expect(result.messages.join(' ')).toContain('물리 검증');
  });

  it('detects the same cargo fragmented into several disconnected regions', () => {
    const placements = [
      box({ x: 0, y: 0 }), box({ x: 0, y: 0.4 }),
      box({ x: 2.4, y: 0 }), box({ x: 2.4, y: 0.4 }),
      box({ x: 4.8, y: 0 }), box({ x: 4.8, y: 0.4 }),
    ];
    const result = assessShapeQuality(container, placements);
    expect(result.fragmentedCargoTypes).toBe(1);
    expect(result.shapePenalty).toBeGreaterThanOrEqual(7);
  });
});

describe('componentCount: sorted sweep equals the all-pairs reference', () => {
  // Deterministic pseudo-random layouts (fixed seeds): grids with holes, stacks, edge
  // contacts inside and just outside the 1e-6 tolerance, corner-only contacts and overlaps.
  const random = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('matches on generated layout %i', seed => {
    const next = random(seed);
    const items: Placement[] = [];
    const count = 20 + Math.floor(next() * 220);
    for (let i = 0; i < count; i += 1) {
      const jitter = [0, 0, 5e-7, 1e-6, 1.5e-6, 4e-6, -5e-7][Math.floor(next() * 7)];
      items.push(box({
        x: Math.floor(next() * 9) * .6 + jitter, y: Math.floor(next() * 5) * .4 + (next() < .2 ? jitter : 0),
        z: Math.floor(next() * 4) * .4, length: next() < .15 ? 1.2 : .6, width: next() < .15 ? .8 : .4,
      }));
    }
    expect(componentCount(items)).toBe(componentCountAllPairs(items));
  });

  it('matches for the degenerate cases the sweep must not mishandle', () => {
    const cases: Placement[][] = [
      [],
      [box()],
      // Corner contact only: no shared face, two groups.
      [box({ x: 0, y: 0 }), box({ x: .6, y: .4 })],
      // Same footprint stacked: faces do not touch sideways, two groups.
      [box({ z: 0 }), box({ z: .4 })],
      // Exactly on and just beyond the contact tolerance.
      [box({ x: 0 }), box({ x: .6 + 1e-6 }), box({ x: 1.2 + 1e-6 + 2e-6 })],
      // Non-finite input falls back to the reference search.
      [box({ x: 0 }), box({ x: Number.NaN }), box({ x: .6 })],
      // A long chain is one group however the cartons are ordered.
      Array.from({ length: 60 }, (_, i) => box({ x: ((i * 37) % 60) * .6 })),
    ];
    for (const items of cases) expect(componentCount(items)).toBe(componentCountAllPairs(items));
    expect(componentCount(cases[6])).toBe(1);
    expect(componentCount(cases[2])).toBe(2);
  });

  it('keeps the quality verdict of a dense 2,400-carton single-SKU load', () => {
    const placements: Placement[] = [];
    for (let ix = 0; ix < 20; ix += 1) for (let iy = 0; iy < 15; iy += 1) for (let iz = 0; iz < 8; iz += 1) {
      placements.push(box({ x: ix * .235, y: iy * .13, z: iz * .265, length: .235, width: .13, height: .265 }));
    }
    expect(componentCount(placements)).toBe(8); // one connected sheet per tier
    expect(assessShapeQuality({ ...container, length: 12, height: 2.7 }, placements).fragmentedCargoTypes).toBe(1);
  });

  it('reuses an assessment only while the same list is unchanged, and hands out independent copies', () => {
    // One tier of 300 cartons in a single connected sheet: not fragmented.
    const placements: Placement[] = [];
    for (let ix = 0; ix < 20; ix += 1) for (let iy = 0; iy < 15; iy += 1) {
      placements.push(box({ x: ix * .235, y: iy * .13, length: .235, width: .13, height: .265 }));
    }
    const wide = { ...container, length: 12 };
    const first = assessShapeQuality(wide, placements);
    expect(first.fragmentedCargoTypes).toBe(0);
    first.messages.push('edited by a caller'); first.fragmentedCargoTypes = 9;
    expect(assessShapeQuality(wide, placements)).toEqual({ ...first, fragmentedCargoTypes: 0, messages: first.messages.slice(0, -1) });
    // The same array, edited in place: two columns are pulled out into separate islands.
    for (const p of placements) { if (Math.abs(p.x - 5 * .235) < 1e-9) p.x += 3; else if (Math.abs(p.x - 12 * .235) < 1e-9) p.x += 4; }
    const edited = assessShapeQuality(wide, placements);
    expect(componentCount(placements)).toBe(componentCountAllPairs(placements));
    expect(componentCount(placements)).toBeGreaterThan(2);
    expect(edited.fragmentedCargoTypes).toBe(1);
  });

  it('assesses again after an in-place move that keeps every coordinate total unchanged', () => {
    // One connected 20 × 15 sheet. Three cartons are then moved by (+4, −2) each, to
    // separate spots clear of the sheet. x + 2·y is the same before and after for every
    // carton, so a digest built from coordinate totals would not notice the edit; only a
    // value-by-value comparison does.
    const placements: Placement[] = [];
    for (let ix = 0; ix < 20; ix += 1) for (let iy = 0; iy < 15; iy += 1) {
      placements.push(box({ x: ix * .2, y: 2 + iy * .2, length: .2, width: .2, height: .2 }));
    }
    const wide = { ...container, length: 12, width: 6 };
    expect(assessShapeQuality(wide, placements).fragmentedCargoTypes).toBe(0);
    for (const index of [0, 2, 4]) { placements[index].x += 4; placements[index].y -= 2; }
    expect(componentCount(placements)).toBe(4);
    expect(componentCount(placements)).toBe(componentCountAllPairs(placements));
    expect(assessShapeQuality(wide, placements).fragmentedCargoTypes).toBe(1);
    // Changing only the cargo id of the moved cartons leaves the sheet as the single group of 'A'.
    for (const index of [0, 2, 4]) placements[index].cargoId = 'B';
    expect(assessShapeQuality(wide, placements).fragmentedCargoTypes).toBe(0);
  });
});
