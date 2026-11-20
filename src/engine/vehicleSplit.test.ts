import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { MAX_SPLIT_VEHICLES, canSplitInto, cargoUnitCount, cargoWeightKg, splitCargoEvenly } from './vehicleSplit';
import { reportedTwentyFoot, reportedTwentyFootCargo as reportedCargo } from '../testFixtures/reportedTwentyFootShipment';
import type { CargoItem } from './types';

const line = (id: string, quantity: number, weightKg: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .4, width: .3, height: .25, weightKg, quantity, maxTopLoadKg: 60, ...overrides,
});
const quantities = (share: CargoItem[]) => Object.fromEntries(share.map(item => [item.id, item.quantity]));

describe('even split of a job over several vehicles (AGENTS.md 2L)', () => {
  it('gives every vehicle half of every line and keeps every carton', () => {
    const cargo = [line('A', 10, 5), line('B', 4, 2)];
    const before = JSON.stringify(cargo);
    const shares = splitCargoEvenly(cargo, 2);
    expect(shares.map(quantities)).toEqual([{ A: 5, B: 2 }, { A: 5, B: 2 }]);
    expect(JSON.stringify(cargo)).toBe(before);
    // Everything but the quantity travels with the line.
    expect(shares[1][0]).toEqual({ ...cargo[0], quantity: 5 });
    expect(shares[0][0]).not.toBe(cargo[0]);
  });

  it('hands the cartons that do not divide to the vehicle that is lightest so far, heaviest line first', () => {
    // Whole shares weigh 77 kg each. HEAVY's odd carton goes to vehicle 1 (equal: the earlier
    // vehicle), 97 to 77. Vehicle 2 is then the lighter one and takes MID's, 97 to 89, and it is
    // still the lighter one for LIGHT's.
    const shares = splitCargoEvenly([line('LIGHT', 3, 1), line('HEAVY', 5, 20), line('MID', 7, 12)], 2);
    expect(shares.map(quantities)).toEqual([{ LIGHT: 1, HEAVY: 3, MID: 3 }, { LIGHT: 2, HEAVY: 2, MID: 4 }]);
    expect(shares.map(cargoWeightKg)).toEqual([97, 90]);
    // Lines keep the order of the input.
    expect(shares[0].map(item => item.id)).toEqual(['LIGHT', 'HEAVY', 'MID']);
  });

  it('spreads single cartons instead of sending them all to one vehicle', () => {
    const singles = Array.from({ length: 6 }, (_, index) => line(`S${index + 1}`, 1, 10));
    const shares = splitCargoEvenly(singles, 2);
    expect(shares.map(cargoUnitCount)).toEqual([3, 3]);
    expect(shares[0].map(item => item.id)).toEqual(['S1', 'S3', 'S5']);
    expect(shares[1].map(item => item.id)).toEqual(['S2', 'S4', 'S6']);
  });

  it('divides over three vehicles with at most one carton of difference in every line', () => {
    const cargo = [line('A', 10, 4), line('B', 8, 9), line('C', 1, 30)];
    const shares = splitCargoEvenly(cargo, 3);
    // Whole shares weigh 30 kg each. C goes to vehicle 1 (60), B's two cartons to vehicles 2 and 3
    // (39 each), A's one carton to vehicle 2, the earlier of the two lightest.
    expect(shares.map(quantities)).toEqual([{ A: 3, B: 2, C: 1 }, { A: 4, B: 3 }, { A: 3, B: 3 }]);
    for (const item of cargo) {
      const perVehicle = shares.map(share => share.find(entry => entry.id === item.id)?.quantity ?? 0);
      expect(perVehicle.reduce((sum, value) => sum + value, 0)).toBe(item.quantity);
      expect(Math.max(...perVehicle) - Math.min(...perVehicle)).toBeLessThanOrEqual(1);
    }
  });

  it('is a function of the input alone', () => {
    const cargo = [line('B', 7, 3), line('A', 7, 3), line('C', 9, 3)];
    expect(splitCargoEvenly(cargo, 2)).toEqual(splitCargoEvenly(cargo.map(item => ({ ...item })), 2));
    // Equal weights: the smaller id is handed out first, whatever the order of the list.
    expect(splitCargoEvenly(cargo, 2).map(quantities)).toEqual([{ B: 3, A: 4, C: 5 }, { B: 4, A: 3, C: 4 }]);
  });

  it('drops empty lines and leaves a line with an invalid quantity whole in vehicle 1', () => {
    const shares = splitCargoEvenly([line('EMPTY', 0, 5), line('BROKEN', 2.5, 5), line('OK', 4, 5)], 2);
    expect(shares.map(quantities)).toEqual([{ BROKEN: 2.5, OK: 2 }, { OK: 2 }]);
  });

  it('refuses a vehicle count outside the fixed bounds', () => {
    expect(() => splitCargoEvenly([line('A', 4, 1)], 1)).toThrow(RangeError);
    expect(() => splitCargoEvenly([line('A', 4, 1)], MAX_SPLIT_VEHICLES + 1)).toThrow(RangeError);
    expect(() => splitCargoEvenly([line('A', 4, 1)], 2.5)).toThrow(RangeError);
  });

  it('is offered only when every vehicle would carry something', () => {
    expect(canSplitInto([line('A', 2, 1)], 2)).toBe(true);
    expect(canSplitInto([line('A', 1, 1)], 2)).toBe(false);
    expect(canSplitInto([line('A', 2, 1)], 3)).toBe(false);
    expect(canSplitInto([line('A', 0, 1), line('B', 2.5, 1)], 2)).toBe(false);
    expect(canSplitInto([line('A', 40, 1)], MAX_SPLIT_VEHICLES + 1)).toBe(false);
  });

  it('loads the reported 20 ft shipment completely when it is divided over two vehicles', () => {
    const single = loadContainer(reportedTwentyFoot, reportedCargo, { strategy: 'stability', publish: false });
    const waiting = single.remaining.reduce((sum, item) => sum + item.quantity, 0);
    expect(single.placements).toHaveLength(2828);
    expect(waiting).toBe(79);

    const shares = splitCargoEvenly(reportedCargo, 2);
    expect(shares.map(cargoUnitCount)).toEqual([1453, 1454]);
    expect(shares.map(share => Math.round(cargoWeightKg(share) * 10) / 10)).toEqual([4772, 4771.6]);
    expect(shares.map(quantities)).toEqual([
      { P003: 47, 'P003-PART': 1, P014: 46, P042: 111, P050: 28, G002: 1220 },
      { P003: 46, P014: 47, 'P014-PART': 1, P042: 111, 'P042-PART': 1, P050: 27, 'P050-PART': 1, G002: 1219, 'G002-PART': 1 },
    ]);
    const top = (placements: Array<{ z: number; height: number }>) => Math.max(...placements.map(p => p.z + p.height));
    for (const share of shares) {
      const result = loadContainer(reportedTwentyFoot, share, { strategy: 'stability', publish: false });
      expect(result.remaining).toEqual([]);
      expect(result.placements).toHaveLength(cargoUnitCount(share));
      expect(result.validationIssues).toEqual([]);
      expect((result.operationalFindings ?? []).filter(finding => finding.severity === 'error')).toEqual([]);
      // Half the cargo stands lower than the single load, which reaches 2.12 m.
      expect(top(result.placements)).toBeLessThan(top(single.placements) - .5);
    }
  });
});
