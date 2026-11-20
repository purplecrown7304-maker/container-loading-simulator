import { describe, expect, it } from 'vitest';
import { createStackLedger } from './stackLedger';
import { canPlaceByStackingRules, countStackLayersBelow } from './stacking';
import { setFootprintGridsEnabledForTests } from './footprintGrid';
import type { CargoItem, Placement } from './types';

const cargo = (id: string, length: number, width: number, height: number, weightKg: number, extra: Partial<CargoItem> = {}): CargoItem =>
  ({ id, name: id, length, width, height, weightKg, quantity: 1, ...extra });
const at = (item: CargoItem, x: number, y: number, z: number, rotated = false): Placement =>
  ({ cargoId: item.id, x, y, z, length: rotated ? item.width : item.length, width: rotated ? item.length : item.width, height: item.height, weightKg: item.weightKg, rotated });
const round = (value: number) => Math.round(value * 1e9) / 1e9;

/** A floor tier of `base` and tiers of `upper` laid across its joints, lowest first. */
function tiers(base: CargoItem, upper: CargoItem, upperTiers: number, baseTiers = 1) {
  const out: Placement[] = [];
  for (let k = 0; k < baseTiers; k++) for (let ix = 0; ix < 4; ix++) for (let iy = 0; iy < 4; iy++) out.push(at(base, round(ix * base.length), round(iy * base.width), round(k * base.height)));
  const nx = Math.floor(4 * base.length / upper.width + 1e-9), ny = Math.floor(4 * base.width / upper.length + 1e-9);
  for (let k = 0; k < upperTiers; k++) for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++)
    out.push(at(upper, round(ix * upper.width), round(0.01 + iy * upper.length), round(baseTiers * base.height + k * upper.height), true));
  return out;
}

/** Adds every carton the reference rules allow, checking that the ledger answers the same. */
function replay(items: CargoItem[], candidates: Placement[]) {
  const byId = new Map(items.map(item => [item.id, item]));
  const ledger = createStackLedger(byId, { minX: 0, minY: 0, maxX: 2, maxY: 2, cell: 0.2 });
  let refused = 0;
  for (const candidate of candidates) {
    const item = byId.get(candidate.cargoId)!;
    const examined = ledger.examine(item, candidate);
    expect(examined.layers).toBe(countStackLayersBelow(candidate, ledger.items));
    const allowed = canPlaceByStackingRules(item, candidate, ledger.items, byId);
    expect(examined.allowed).toBe(allowed);
    if (allowed) examined.add(); else refused++;
  }
  return { ledger, refused };
}

describe('stack ledger', () => {
  const heavy = cargo('heavy', .26, .24, .225, 22, { maxTopLoadKg: 40.2 });
  const light = cargo('light', .235, .13, .265, 1.42, { maxTopLoadKg: 34.3 });

  it('answers stack depth and transmitted load like stacking.ts for cartons laid across joints', () => {
    const { ledger, refused } = replay([heavy, light], tiers(heavy, light, 9));
    // A heavy carton carries every light carton above it whole: the upper tiers are refused.
    expect(refused).toBeGreaterThan(0);
    expect(ledger.items.length).toBeGreaterThan(16 + 3 * 28);
  });

  it('counts a second heavy tier and the cartons on it against the carton underneath', () => {
    const { refused } = replay([heavy, light], tiers(heavy, light, 5, 2));
    expect(refused).toBeGreaterThan(0);
  });

  it('keeps declared stack depth, unverified strength and top pressure', () => {
    const shallow = cargo('shallow', .26, .24, .225, 22, { maxStackLayers: 2 });
    expect(replay([shallow, light], tiers(shallow, light, 3)).refused).toBeGreaterThan(0);
    const unverified = cargo('unverified', .26, .24, .225, 22, { strengthUnverified: true });
    expect(replay([unverified, light], tiers(unverified, light, 1)).ledger.items).toHaveLength(16);
    const pressed = cargo('pressed', .26, .24, .225, 22, { maxTopPressureKgPerM2: 60 });
    expect(replay([pressed, light], tiers(pressed, light, 4)).refused).toBeGreaterThan(0);
    const capped = cargo('capped', .235, .13, .265, 1.42, { maxStackLayers: 3 });
    expect(replay([heavy, capped], tiers(heavy, capped, 4)).refused).toBeGreaterThan(0);
  });

  it('gives the same answers without the footprint index', () => {
    setFootprintGridsEnabledForTests(false);
    try { expect(replay([heavy, light], tiers(heavy, light, 9)).refused).toBeGreaterThan(0); } finally { setFootprintGridsEnabledForTests(true); }
  });
});
