import { describe, expect, it } from 'vitest';
import { arrangePalletsAroundFixed, FIXED_PALLET_NO_FLOOR_REASON, FIXED_PALLET_PAYLOAD_REASON, packOnPalletsAroundFixed } from './palletFixedArrangement';
import { centerPalletCargo } from './palletCentering';
import { PALLET_CATALOG, palletSpecForType } from './palletCatalog';
import { packOnPallets } from './palletOptimization';
import { longitudinalCgLimitM, validateOperationalLoading } from './operationalValidator';
import { palletSupportBodies } from './palletPlanValidation';
import type { PalletLoad } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, ceilingClearanceM: .05 };
const spec = { ...palletSpecForType(PALLET_CATALOG.find(type => type.id === 't11-plastic')!), useWrapping: false, useCornerGuards: false };
const cartons = (quantity: number): CargoItem[] => [{ id: 'BOX', name: 'box', quantity, length: .5, width: .5, height: .4, weightKg: 8, maxStackLayers: 2, maxTopLoadKg: 400, allowRotation: true } as CargoItem];
const plain = (cargo: CargoItem[], space = container) => centerPalletCargo(packOnPallets(space, cargo, spec, 'capacity'), space);
const moved = (load: PalletLoad, x: number, y: number, z = load.z): PalletLoad => ({ ...load, x, y, z,
  cargoPlacements: load.cargoPlacements.map((p, index) => ({ ...p, x: p.x + x - load.x, y: p.y + y - load.y, z: p.z + z - load.z, unitId: `staging-box:test:BOX:${index}` })),
  centerOfGravity: { x: load.centerOfGravity.x + x - load.x, y: load.centerOfGravity.y + y - load.y, z: load.centerOfGravity.z + z - load.z } });
const floorOverlap = (a: PalletLoad, b: PalletLoad) => a.x < b.x + b.length - 1e-6 && b.x < a.x + a.length - 1e-6 && a.y < b.y + b.width - 1e-6 && b.y < a.y + a.width - 1e-6;
const at = (pallets: PalletLoad[], x: number, y: number) => pallets.find(load => Math.abs(load.x - x) < 1e-9 && Math.abs(load.y - y) < 1e-9 && load.z === 0);
const cartonKeys = (load: PalletLoad) => load.cargoPlacements.map(p => [p.cargoId, p.x, p.y, p.z, p.length, p.width, p.height].join(':')).sort();

describe('automatic pallet loading around hand-placed pallets', () => {
  it('is the ordinary plan when nothing is hand-placed', () => {
    const cargo = cartons(48);
    expect(packOnPalletsAroundFixed(container, cargo, spec, 'capacity')).toEqual(plain(cargo));
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [])).toMatchObject({ kept: 0, moved: 0, unplaced: 0 });
  });

  it('keeps a hand-placed pallet exactly where it was put and loads everything else around it', () => {
    const cargo = cartons(48), before = JSON.stringify(cargo), automatic = plain(cargo);
    expect(automatic.pallets).toHaveLength(6); expect(automatic.remaining).toEqual([]);
    // One pallet pulled out of the block to an off-grid place near the door.
    const hand = moved(automatic.pallets[0], 7.35, .4), handBefore = JSON.stringify(hand);
    const arranged = arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [hand]);
    const { result } = arranged;
    expect(arranged.kept).toBe(1); expect(arranged.unplaced).toBe(0); expect(result.remaining).toEqual([]);
    const fixed = at(result.pallets, 7.35, .4)!;
    expect(fixed).toBeDefined(); expect(cartonKeys(fixed)).toEqual(cartonKeys(hand)); expect(fixed.palletIndex).toBe(hand.palletIndex);
    // Every carton is loaded once; none is lost or doubled.
    expect(result.pallets).toHaveLength(6); expect(result.placements).toHaveLength(48); expect(result.palletCount).toBe(6);
    expect(result.placements).toEqual(result.pallets.flatMap(load => load.cargoPlacements));
    expect(new Set(result.pallets.map(load => load.palletIndex)).size).toBe(6);
    // The result carries no carton identity: the staging inventory numbers it afresh.
    expect(result.placements.every(p => p.unitId === undefined)).toBe(true);
    // Nothing stands in anything else's footprint, and the operational checks find no hard error.
    const floor = result.pallets.filter(load => load.z === 0);
    for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) expect(floorOverlap(floor[i], floor[j]), `${i}/${j}`).toBe(false);
    const errors = validateOperationalLoading(container, cargo, result.placements, palletSupportBodies(result)).filter(f => f.severity === 'error' && !f.code.startsWith('CG_'));
    expect(errors).toEqual([]);
    // The other five are where the planner alone would put five pallets: none had to give way.
    const others = plain(cartons(40));
    expect(arranged.moved).toBe(0);
    expect(result.pallets.filter(load => load !== fixed).map(load => [load.x, load.y, load.z]).sort()).toEqual(others.pallets.map(load => [load.x, load.y, load.z]).sort());
    expect(JSON.stringify(cargo)).toBe(before); expect(JSON.stringify(hand)).toBe(handBefore);
    // Same input, same plan.
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [hand])).toEqual(arranged);
  });

  it('slides the planned columns of that lane past a hand-placed pallet so they touch it, and leaves the other lane alone', () => {
    const cargo = cartons(48), automatic = plain(cargo), others = plain(cartons(40));
    // Half a pallet into the block: it covers part of two of the planner's places in one lane.
    const target = others.pallets.filter(load => load.z === 0).sort((a, b) => a.x - b.x || a.y - b.y)[0];
    const hand = moved(automatic.pallets[0], target.x + .55, target.y);
    const arranged = arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [hand]);
    const { result } = arranged;
    expect(arranged.kept).toBe(1); expect(arranged.unplaced).toBe(0);
    expect(at(result.pallets, target.x + .55, target.y)).toBeDefined();
    expect(result.placements).toHaveLength(48); expect(result.remaining).toEqual([]);
    const floor = result.pallets.filter(load => load.z === 0);
    for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) expect(floorOverlap(floor[i], floor[j]), `${i}/${j}`).toBe(false);
    for (const load of floor) { expect(load.x).toBeGreaterThanOrEqual(0); expect(load.x + load.length).toBeLessThanOrEqual(container.length + 1e-9); expect(load.y + load.width).toBeLessThanOrEqual(container.width + 1e-9); }
    // The other lane is exactly as planned.
    const sameLane = (load: PalletLoad) => load.y < hand.y + hand.width - 1e-6 && hand.y < load.y + load.width - 1e-6;
    const otherLane = others.pallets.filter(load => !sameLane(load));
    expect(otherLane.length).toBeGreaterThan(0);
    for (const load of otherLane) expect(at(result.pallets, load.x, load.y), `${load.x},${load.y}`).toBeDefined();
    // Its own lane closes up behind it: each column touches the one before, the first one
    // touches the hand-placed pallet, and no gap is left toward the door.
    const lane = floor.filter(load => sameLane(load) && load.x > hand.x).sort((a, b) => a.x - b.x);
    expect(lane).toHaveLength(others.pallets.filter(sameLane).length); expect(arranged.moved).toBe(lane.length);
    lane.forEach((load, index) => expect(load.x).toBeCloseTo(hand.x + hand.length * (index + 1), 6));
  });

  it('sets the planned group toward the door only as far as the centre of gravity of the whole load requires', () => {
    const cargo = cartons(48), automatic = plain(cargo);
    // A load at its payload: the verdict leaves little room, and the planner alone already
    // has to leave the inner wall.
    const full: ContainerSpec = { ...container, maxPayloadKg: automatic.totalPalletizedWeightKg + 1 };
    const alone = plain(cargo, full), aloneStart = Math.min(...alone.pallets.map(load => load.x));
    expect(aloneStart).toBeGreaterThan(.5);
    // One pallet is put back against the inner wall by hand.
    const lane = alone.pallets[0].y, hand = moved(alone.pallets[0], 0, lane);
    const { result, kept, unplaced } = arrangePalletsAroundFixed(full, cargo, spec, 'capacity', [hand]);
    expect(kept).toBe(1); expect(unplaced).toBe(0); expect(result.placements).toHaveLength(48);
    expect(at(result.pallets, 0, lane)).toBeDefined();
    const weight = result.placements.reduce((sum, p) => sum + p.weightKg, 0);
    const cog = result.placements.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weightKg, 0) / weight;
    const allowed = longitudinalCgLimitM(full, weight, true);
    // In range, and at the inner edge of it: no further toward the door than needed.
    expect(Math.abs(cog - full.length / 2)).toBeLessThanOrEqual(allowed + 1e-6);
    expect(cog).toBeLessThan(full.length / 2 - allowed + .01);
    // The planned group had to go further than it would alone, to carry the pallet at the wall.
    const start = Math.min(...result.pallets.filter(load => load.x > 0).map(load => load.x));
    expect(start).toBeGreaterThan(aloneStart);
    expect(validateOperationalLoading(full, cargo, result.placements, palletSupportBodies(result)).filter(f => f.severity === 'error')).toEqual([]);
    // A hand-placed pallet near the door carries part of that instead: the group stays nearer the wall.
    const near = arrangePalletsAroundFixed(full, cargo, spec, 'capacity', [moved(alone.pallets[0], 9, lane)]).result;
    expect(Math.min(...near.pallets.map(load => load.x))).toBeLessThan(aloneStart);
  });

  it('keeps a pair stacked by hand as it is and stacks nothing else on it', () => {
    const cargo = cartons(48), automatic = plain(cargo);
    const lower = moved(automatic.pallets[0], 6.6, .625), lowerTop = lower.z + Math.max(...lower.cargoPlacements.map(p => p.z + p.height));
    const upper = { ...moved(automatic.pallets[1], 6.6, .625, lowerTop), stackLevel: 2, stackColumn: lower.stackColumn };
    const { result, kept } = arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [lower, upper]);
    expect(kept).toBe(2); expect(result.placements).toHaveLength(48); expect(result.stackedPallets).toBe(1); expect(result.maxUsedStackLevel).toBe(2);
    const column = result.pallets.filter(load => Math.abs(load.x - 6.6) < 1e-9 && Math.abs(load.y - .625) < 1e-9).sort((a, b) => a.z - b.z);
    expect(column.map(load => load.z)).toEqual([0, lowerTop]); expect(cartonKeys(column[1])).toEqual(cartonKeys(upper));
    expect(result.pallets.filter(load => floorOverlap(load, lower))).toHaveLength(2);
  });

  it('leaves cargo unloaded, with the reason, when the hand-placed pallets leave no floor or no payload for it', () => {
    // Four floor places, and one pallet set in the middle of all four.
    const small: ContainerSpec = { ...container, length: 2.3 };
    const cargo = cartons(24), automatic = plain(cargo, small);
    expect(automatic.pallets).toHaveLength(3);
    const hand = moved(automatic.pallets[0], .6, .625);
    const blocked = arrangePalletsAroundFixed(small, cargo, spec, 'capacity', [hand]);
    expect(blocked.kept).toBe(1); expect(blocked.unplaced).toBe(2); expect(blocked.result.pallets).toHaveLength(1);
    expect(blocked.result.placements).toHaveLength(8);
    expect(blocked.result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(16);
    expect(blocked.result.remaining.every(row => row.reason === FIXED_PALLET_NO_FLOOR_REASON && row.reasonCode === 'NO_FEASIBLE_EMS')).toBe(true);
    // The payload is used up by the hand-placed pallet itself.
    const light: ContainerSpec = { ...container, maxPayloadKg: automatic.pallets[0].totalWeightKg };
    const heavy = arrangePalletsAroundFixed(light, cargo, spec, 'capacity', [moved(automatic.pallets[0], 3.3, .625)]);
    expect(heavy.kept).toBe(1); expect(heavy.result.pallets).toHaveLength(1);
    expect(heavy.result.remaining).toEqual([{ cargoId: 'BOX', quantity: 16, reason: FIXED_PALLET_PAYLOAD_REASON, reasonCode: 'PAYLOAD_LIMIT' }]);
  });

  it('plans the rest within the payload the hand-placed pallets leave', () => {
    const cargo = cartons(48), automatic = plain(cargo), unit = automatic.pallets[0].totalWeightKg;
    // Room for the hand-placed pallet and two more, by weight.
    const limited: ContainerSpec = { ...container, maxPayloadKg: unit * 3 + 1 };
    const { result } = arrangePalletsAroundFixed(limited, cargo, spec, 'capacity', [moved(automatic.pallets[0], 7.35, .4)]);
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(limited.maxPayloadKg);
    expect(result.placements.length + result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(48);
    expect(result.remaining.length).toBeGreaterThan(0);
  });

  it('ignores hand-placed pallets that no longer describe the job and plans as usual', () => {
    const cargo = cartons(48), automatic = plain(cargo), hand = moved(automatic.pallets[0], 7.35, .4);
    const ordinary = plain(cargo);
    // Cargo that is no longer on the list, or more of it than the list has.
    expect(arrangePalletsAroundFixed(container, cartons(4), spec, 'capacity', [hand])).toMatchObject({ kept: 0, result: plain(cartons(4)) });
    const foreign = { ...hand, cargoPlacements: hand.cargoPlacements.map(p => ({ ...p, cargoId: 'GONE' })) };
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [foreign])).toMatchObject({ kept: 0, result: ordinary });
    // Outside the equipment, or two on the same floor place without being stacked.
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [moved(automatic.pallets[0], 11.5, .4)]).kept).toBe(0);
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [hand, moved(automatic.pallets[1], 7.6, .4)]).kept).toBe(0);
    expect(arrangePalletsAroundFixed(container, cargo, spec, 'capacity', [{ ...hand, x: NaN }]).kept).toBe(0);
    // Built on another pallet than the one this job now uses.
    expect(arrangePalletsAroundFixed(container, cargo, { ...spec, length: 1.2 }, 'capacity', [hand]).kept).toBe(0);
    // The A rules and the numerical review keep their own planning.
    const aRules: ContainerSpec = { ...container, rules: { version: 'a-v1', equipmentId: 'fixed-test', kind: 'container', access: ['rear'], source: 'test' } as ContainerSpec['rules'] };
    expect(arrangePalletsAroundFixed(aRules, cargo, spec, 'capacity', [hand]).kept).toBe(0);
  });
});
