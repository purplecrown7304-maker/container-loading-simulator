import { beforeEach, describe, expect, it } from 'vitest';
import { clearStagingPins, fixedPalletsFor, livingPinKeys, palletPinKey, readStagingPins, setStagingPins, stagingPinKeys } from './stagingPins';
import type { PalletLoad } from './engine/palletPacking';

const pallet = (index: number, x: number, y: number, z = 0, cargoId = 'A'): PalletLoad => ({ palletIndex: index, x, y, z, stackLevel: z ? 2 : 1, stackColumn: index,
  length: 1.1, width: 1.1, height: .15, cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 40,
  centerOfGravity: { x: x + .55, y: y + .55, z: z + .4 },
  cargoPlacements: [0, 1].map(slot => ({ cargoId, unitId: `staging-box:${index}:${slot}`, x: x + slot * .5, y, z: z + .15, length: .5, width: .5, height: .4, weightKg: 10 })) });

beforeEach(() => clearStagingPins());

describe('hand-placed pallet pins', () => {
  it('names a pallet by where it stands and what it holds, not by what its cartons are called', () => {
    const load = pallet(1, 2.2, .075), key = palletPinKey(load);
    const renamed = { ...load, palletIndex: 9, cargoPlacements: [...load.cargoPlacements].reverse().map(({ unitId: _unitId, ...p }) => p) };
    expect(palletPinKey(renamed)).toBe(key);
    // Float noise below a millimetre is the same place.
    expect(palletPinKey({ ...load, x: load.x + 2e-7 })).toBe(key);
    // Another place, another level or another cargo is another pallet.
    expect(palletPinKey(pallet(1, 2.3, .075))).not.toBe(key);
    expect(palletPinKey(pallet(1, 2.2, .075, .55))).not.toBe(key);
    expect(palletPinKey(pallet(1, 2.2, .075, 0, 'B'))).not.toBe(key);
  });

  it('holds pins for one input only and keeps the same snapshot when nothing changes', () => {
    const a = palletPinKey(pallet(1, 0, 0)), b = palletPinKey(pallet(2, 1.1, 0));
    setStagingPins('input-1', [b, a, b]);
    const first = readStagingPins();
    expect(first).toEqual({ inputKey: 'input-1', keys: [a, b].sort() });
    expect(stagingPinKeys(first, 'input-1')).toEqual([a, b].sort()); expect(stagingPinKeys(first, 'input-2')).toEqual([]);
    setStagingPins('input-1', [a, b]); expect(readStagingPins()).toBe(first);
    setStagingPins('input-2', [a]); expect(stagingPinKeys(readStagingPins(), 'input-1')).toEqual([]);
    clearStagingPins(); expect(readStagingPins()).toEqual({ inputKey: '', keys: [] });
    const cleared = readStagingPins(); clearStagingPins(); expect(readStagingPins()).toBe(cleared);
  });

  it('fixes the pinned pallets and every pallet a pinned one stands on, in plan order', () => {
    const floor = pallet(1, 0, 0), beside = pallet(2, 1.1, 0), upper = pallet(3, 0, 0, .55), far = pallet(4, 5.5, 0);
    const plan = [floor, beside, upper, far];
    expect(fixedPalletsFor([], plan)).toEqual([]);
    expect(fixedPalletsFor([palletPinKey(far)], plan)).toEqual([far]);
    // The upper pallet cannot stay where it is unless the one under it does.
    expect(fixedPalletsFor([palletPinKey(upper)], plan)).toEqual([floor, upper]);
    // A pinned floor pallet does not fix what was stacked on it.
    expect(fixedPalletsFor([palletPinKey(floor)], plan)).toEqual([floor]);
    expect(fixedPalletsFor([palletPinKey(pallet(9, 9, 0))], plan)).toEqual([]);
  });

  it('drops the pins a plan no longer has a pallet for', () => {
    const kept = pallet(1, 0, 0), gone = pallet(2, 1.1, 0);
    const keys = [palletPinKey(kept), palletPinKey(gone)];
    expect(livingPinKeys(keys, [kept, pallet(3, 3.3, 0)])).toEqual([palletPinKey(kept)]);
    expect(livingPinKeys(keys, [])).toEqual([]); expect(livingPinKeys([], [kept])).toEqual([]);
  });
});
