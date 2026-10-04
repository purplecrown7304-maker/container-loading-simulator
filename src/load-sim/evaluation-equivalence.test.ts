import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/attachment-a-equivalence.json';
import { pack, type PackOptions } from './pack';
import { DEFAULT_CONFIG } from './presets';
import { canPlace, checkOverlap, createAppendOnlyPlacementChecker, validate } from './validate';
import type { Config, Item, Placement, Space } from './types';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Goldens were generated from the unmodified supplied A attachment, not this
// implementation. They fingerprint complete outputs, including order, all
// numeric metrics, chosen orientations, violations and unloading stop reports.
describe('attachment A evaluation equivalence', () => {
  for (const fixture of golden.pack) {
    it(`matches the full native result for ${fixture.name}`, () => {
      const result = pack(fixture.items as Item[], fixture.space as Space, fixture.options as PackOptions);
      expect(digest(result)).toBe(fixture.resultDigest);
    });
  }
  it('matches original rejection and validation output for invalid/offset/tilted/support/line/unload candidates', () => {
    for (const fixture of golden.candidates) {
      const existing = fixture.existing as Placement[];
      const candidate = fixture.candidate as Placement;
      const space = fixture.space as Space;
      const cfg = fixture.config as Config;
      expect(digest(canPlace(existing, candidate, space, cfg))).toBe(fixture.canPlaceDigest);
      expect(digest(validate([...existing, candidate], space, cfg))).toBe(fixture.validateDigest);
      expect(digest([-1, 0, 1, 2, 3, 4, 2.5].map(only => checkOverlap([...existing, candidate], cfg, only)))).toBe(fixture.overlapDigest);
    }
  });

  it('append-only reuse matches stateless checks after every acceptance and rejection, including tolerance-sized heights', () => {
    let seed = 852741;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = <T,>(values: T[]): T => values[Math.floor(rand() * values.length)];
    for (let trial = 0; trial < 24; trial++) {
      const cfg = { ...DEFAULT_CONFIG, heightTolerance: pick([0, 5, 20]), epsilon: pick([0, 0.5, 4]), minSupportRatio: pick([0, 0.5, 0.8, 1]) };
      const space: Space = { id: 'append', kind: 'container', inner: { l: 500, w: 500, h: 500 }, access: ['rear'], maxPayload: 200, tare: 0, floorLineLoad: 1000 };
      const check = createAppendOnlyPlacementChecker(space, cfg);
      const accepted: Placement[] = [];
      for (let i = 0; i < 80; i++) {
        const candidate: Placement = {
          item: { id: `${trial}-${i}`, type: 'carton', dims: { l: 50, w: 50, h: pick([1, 3, 10, 50, 100]) }, weight: pick([0, 0.1, 2, 20]),
            maxTier: pick([undefined, 1, 2, 4]), maxTopLoad: pick([undefined, 0, 10, 100]), maxTopPressure: pick([undefined, 500, 10000]), stopSeq: pick([undefined, 1, 2]) },
          pos: { x: pick([0, 50, 100, 150]), y: pick([0, 50]), z: pick([0, 1, 3, 10, 20, 50, 100]) }, orientation: 'LWH',
        };
        const expected = canPlace(accepted, candidate, space, cfg).length === 0;
        expect(check(candidate), `trial ${trial}, candidate ${i}`).toBe(expected);
        if (expected) accepted.push(candidate);
      }
    }
  });

  it('does not reuse geometry across public calls after editable placements or config change', () => {
    const space: Space = { id: 'edits', kind: 'container', inner: { l: 500, w: 500, h: 500 }, access: ['rear'], maxPayload: 500, tare: 0 };
    const base: Placement = { item: { id: 'base', type: 'carton', dims: { l: 100, w: 100, h: 100 }, weight: 1 }, pos: { x: 0, y: 0, z: 0 }, orientation: 'LWH' };
    const top: Placement = { item: { ...base.item, id: 'top' }, pos: { x: 0, y: 0, z: 100 }, orientation: 'LWH' };
    expect(canPlace([base], top, space)).toEqual([]);
    base.pos.x = 200;
    expect(canPlace([base], top, space).map(v => v.code)).toContain('FLOATING');
    base.pos.x = 0;
    base.item.maxTopLoad = 0;
    expect(canPlace([base], top, space).map(v => v.code)).toContain('NO_STACK_ON_TOP');
    delete base.item.maxTopLoad;
    expect(canPlace([base], top, space)).toEqual([]);
    expect(canPlace([base], top, space, { payloadRatio: 0.001 }).map(v => v.code)).toContain('PAYLOAD_EXCEEDED');
  });
});
