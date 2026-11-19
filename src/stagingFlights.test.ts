// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildStagingFlights, STAGING_FLIGHT_PROFILE, STAGING_RELOCATION_PROFILE } from './stagingFlights';
import type { StagingInventory, StagingUnit } from './stagingInventory';
import { buildStagingYardLayout, type StagingYardLayout, type StagingYardSlot } from './stagingYardLayout';
import type { PalletLoad } from './engine/palletOptimization';

const container = { length: 6, width: 2.4, height: 2.5 };
function unit(id: string, members = [id], extra: Partial<StagingUnit> = {}): StagingUnit {
  return { id, kind: 'box', name: id, cargoId: 'SKU', cargoIds: ['SKU'], length: .5, width: .4, height: .3, weightKg: 1,
    boxCount: members.length, unloadPriorities: [], location: 'yard', verdict: 'pending', reasons: [],
    boxUnits: members.map((stableId, index) => ({ id: 'engine:' + index, cargoId: 'SKU', stableId })), ...extra };
}
function loaded(id: string, members = [id], extra: Partial<StagingUnit> = {}) {
  return unit(id, members, { location: 'vehicle', verdict: 'placed',
    placement: { cargoId: 'SKU', x: 1, y: .5, z: .6, length: .4, width: .5, height: .3, weightKg: 1 }, ...extra });
}
function inventory(units: StagingUnit[], signature = 'same-input'): StagingInventory {
  const empty = { pallets: 0, looseBoxes: 0, boxes: 0, weightKg: 0 };
  return { inputSignature: signature, units, yardUnits: units.filter(item => item.location === 'yard'),
    vehicleUnits: units.filter(item => item.location === 'vehicle'), otherVehicleUnits: units.filter(item => item.location === 'other-vehicle'),
    summary: { total: empty, vehicle: empty, otherVehicles: empty, yard: empty, unloaded: empty }, excluded: [], issues: [],
    packagingStatus: 'not-required', referenceResult: false, identity: { unitToStableId: {} } };
}
function slot(unitId: string, x = 9): StagingYardSlot {
  return { unitId, zoneId: 'A', label: 'A-01', slotIndex: 0, groupKey: 'boxes', center: [x, -.8, 2], rotationY: .4,
    localCenter: [2, 2], length: .5, width: .4, height: .3 };
}
function layout(slots: StagingYardSlot[]): StagingYardLayout {
  return { ...buildStagingYardLayout([], { container, vehicleRig: 'none' }), slots };
}
describe('accepted staging flight membership', () => {
  it('keeps the yard footprint when an accepted box is rotated, while preserving the accepted endpoint', () => {
    const before = inventory([unit('box')]), old = layout([slot('box')]);
    const next = inventory([loaded('box')]);
    expect(buildStagingFlights(before, old, next, container)).toEqual([{ unitId: 'box', from: { position: [9, -.8, 2], rotationY: .4 + Math.PI / 2 },
      to: { position: [-1.8, .6, -.44999999999999996], rotationY: 0 }, durationMs: 1500, delayMs: 0 }]);
  });
  it('matches unchanged whole member sets across root and engine ID changes and member ordering', () => {
    const before = inventory([unit('old-pallet', ['stable-a', 'stable-b'], { kind: 'pallet' })]);
    const after = inventory([loaded('new-pallet', ['stable-b', 'stable-a'], { kind: 'pallet', pallet: pallet() })]);
    const built = buildStagingFlights(before, layout([slot('old-pallet')]), after, container)[0];
    expect(built).toMatchObject({ unitId: 'new-pallet', from: { position: [9, -.8, 2] } });
    expect(built.to.position[0]).toBeCloseTo(-1.4, 12); expect(built.to.position[1]).toBe(.2); expect(built.to.position[2]).toBeCloseTo(-.2, 12);
  });
  it('requires a real fallback layout for regrouped packs, preserving the old whole pack slot when available', () => {
    const before = inventory([unit('a'), unit('b')]);
    const after = inventory([loaded('new-pack', ['a', 'b'], { kind: 'pallet', pallet: pallet() })]);
    const old = layout([slot('a'), slot('b', 12)]);
    expect(buildStagingFlights(before, old, after, container)).toEqual([]);
    expect(buildStagingFlights(before, old, after, container, layout([slot('new-pack', 20)]))[0].from.position).toEqual([20, -.8, 2]);
    const whole = inventory([unit('whole', ['a', 'b'], { kind: 'pallet' })]);
    expect(buildStagingFlights(whole, layout([slot('whole', 7)]), after, container, layout([slot('new-pack', 20)]))[0].from.position[0]).toBe(7);
  });
  it('never flies existing, partially assigned, other-vehicle, unknown or duplicate box identities', () => {
    const old = inventory([unit('yard', ['a', 'b']), loaded('already', ['c']), unit('other', ['d'], { location: 'other-vehicle' })]);
    const next = inventory([loaded('existing', ['c']), loaded('partial', ['a', 'c']), loaded('foreign', ['d']), loaded('unknown', ['x']), loaded('repeat', ['b', 'b'])]);
    const fallback = layout(next.units.map((item, index) => slot(item.id, index)));
    expect(buildStagingFlights(old, layout([slot('yard')]), next, container, fallback)).toEqual([]);
  });
  it('rejects ambiguous memberships and missing/invalid visual data, including a signature boundary', () => {
    const before = inventory([unit('a')]), old = layout([slot('a')]), after = inventory([loaded('a')]);
    expect(buildStagingFlights(before, old, inventory([loaded('a')], 'different-input'), container)).toEqual([]);
    expect(buildStagingFlights(inventory([unit('a'), unit('duplicate', ['a'])]), old, after, container)).toEqual([]);
    expect(buildStagingFlights(before, old, inventory([loaded('a'), loaded('duplicate', ['a'])]), container)).toEqual([]);
    expect(buildStagingFlights(before, old, inventory([loaded('a'), loaded('a', ['b'])]), container)).toEqual([]);
    expect(buildStagingFlights(before, layout([slot('a'), slot('a')]), after, container)).toEqual([]);
    expect(buildStagingFlights(before, layout([{ ...slot('a'), center: [NaN, 0, 0] }]), after, container)).toEqual([]);
    expect(buildStagingFlights(before, old, after, { ...container, width: Infinity })).toEqual([]);
    expect(buildStagingFlights(before, old, inventory([loaded('a', ['a'], { placement: undefined })]), container)).toEqual([]);
    expect(buildStagingFlights(before, old, inventory([loaded('a', ['a'], { placement: { ...loaded('a').placement!, x: NaN } })]), container)).toEqual([]);
  });
  it('is deterministic after array reorder and leaves all engine and layout data untouched', () => {
    const a = unit('a'), b = unit('b'), old = inventory([b, a]), next = inventory([loaded('b'), loaded('a')]);
    const slots = layout([slot('b', 8), slot('a', 7)]), fallback = layout([slot('a', 80), slot('b', 70)]);
    const snapshot = JSON.stringify([old, slots, next, fallback, container]);
    const expected = buildStagingFlights(old, slots, next, container, fallback);
    expect(expected.map(item => item.unitId)).toEqual(['a', 'b']);
    expect(buildStagingFlights(inventory([a, b]), layout([...slots.slots].reverse()), inventory([...next.units].reverse()), container, fallback)).toEqual(expected);
    expected[0].from.position[0] = 123; expected[0].to.position[0] = 456;
    expect(JSON.stringify([old, slots, next, fallback, container])).toBe(snapshot);
  });
  it('bounds five thousand prepared vertical flights to 2400ms with distinct deterministic delays', () => {
    const units = Array.from({ length: 5000 }, (_, index) => unit(String(index).padStart(4, '0')));
    const old = inventory(units), next = inventory(units.map(item => loaded(item.id)));
    const flights = buildStagingFlights(old, layout(units.map(item => slot(item.id))), next, container);
    expect(flights).toHaveLength(5000);
    expect(flights[0].delayMs).toBe(0); expect(flights[4999].delayMs).toBe(600);
    expect(new Set(flights.map(item => item.delayMs)).size).toBe(5000);
    expect(STAGING_FLIGHT_PROFILE.path).toBe('vertical'); expect(STAGING_FLIGHT_PROFILE.prepareDurationMs).toBe(300);
    expect(flights.every(item => item.durationMs + item.delayMs + STAGING_FLIGHT_PROFILE.prepareDurationMs <= 2400)).toBe(true);
  });
});

describe('moves inside the vehicle between two accepted plans', () => {
  const at = (id: string, x: number, extra: Partial<StagingUnit> = {}, place: Record<string, number> = {}) => loaded(id, [id], {
    placement: { cargoId: 'SKU', x, y: .5, z: .6, length: .4, width: .5, height: .3, weightKg: 1, ...place }, ...extra });
  const none = layout([]);
  const worldX = (x: number, length = .4) => x + length / 2 - container.length / 2;

  it('hops a carton that is given another place and leaves one that keeps its place alone', () => {
    const before = inventory([at('a', 1), at('b', 2)]), next = inventory([at('a', 1), at('b', 3)]);
    const flights = buildStagingFlights(before, none, next, container);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ unitId: 'b', kind: 'relocate', durationMs: STAGING_RELOCATION_PROFILE.durationMs, delayMs: 0,
      from: { rotationY: 0 }, to: { rotationY: 0 } });
    expect(flights[0].from.position[0]).toBeCloseTo(worldX(2), 12); expect(flights[0].to.position[0]).toBeCloseTo(worldX(3), 12);
    expect(flights[0].from.position[1]).toBe(.6);
    // The same plan again, or the same places under other identities, moves nothing.
    expect(buildStagingFlights(before, none, inventory([at('a', 1), at('b', 2)]), container)).toEqual([]);
    expect(buildStagingFlights(before, none, inventory([at('a', 2), at('b', 1)]), container)).toEqual([]);
  });

  it('treats loose cartons of one cargo row and size as the same goods and moves only the vacated place', () => {
    // Every identity shifts one place toward the door. Only the first place is vacated and
    // only the last is new, so one carton is shown moving, not three.
    const before = inventory([at('a', 1), at('b', 2), at('c', 3)]), next = inventory([at('a', 2), at('b', 3), at('c', 4)]);
    const flights = buildStagingFlights(before, none, next, container);
    expect(flights.map(flight => flight.unitId)).toEqual(['c']);
    expect(flights[0].from.position[0]).toBeCloseTo(worldX(1), 12); expect(flights[0].to.position[0]).toBeCloseTo(worldX(4), 12);
  });

  it('does not exchange cartons of another cargo row, size or height', () => {
    const other = (id: string, x: number) => at(id, x, { cargoId: 'OTHER', cargoIds: ['OTHER'],
      boxUnits: [{ id: 'engine:' + id, cargoId: 'OTHER', stableId: id }] });
    const swapped = buildStagingFlights(inventory([at('a', 1), other('d', 2)]), none, inventory([at('a', 2), other('d', 1)]), container);
    expect(swapped.map(flight => [flight.unitId, flight.kind])).toEqual([['a', 'relocate'], ['d', 'relocate']]);
    expect(swapped[0].from.position[0]).toBeCloseTo(worldX(1), 12); expect(swapped[1].from.position[0]).toBeCloseTo(worldX(2), 12);
    const tall = (id: string, x: number) => at(id, x, {}, { height: .6 });
    const sized = buildStagingFlights(inventory([at('a', 1), tall('t', 2)]), none, inventory([at('a', 2), tall('t', 1)]), container);
    expect(sized.map(flight => flight.unitId)).toEqual(['a', 't']);
    expect(sized[0].from.position[0]).toBeCloseTo(worldX(1), 12);
  });

  it('starts a turned carton a quarter turn away so it shows the footprint it had', () => {
    const turned = buildStagingFlights(inventory([at('a', 1)]), none, inventory([at('a', 3, {}, { length: .5, width: .4 })]), container);
    expect(turned).toHaveLength(1);
    expect(turned[0].from.rotationY).toBeCloseTo(Math.PI / 2, 12); expect(turned[0].to.rotationY).toBe(0);
    expect(turned[0].from.position[0]).toBeCloseTo(worldX(1), 12); expect(turned[0].to.position[0]).toBeCloseTo(worldX(3, .5), 12);
  });

  it('follows a pallet by its exact members and never by a regrouped or partial set', () => {
    const packed = (id: string, members: string[], x: number) => loaded(id, members, { kind: 'pallet', placement: undefined, pallet: { ...pallet(), x } });
    const before = inventory([packed('old', ['a', 'b'], 1)]);
    const moved = buildStagingFlights(before, none, inventory([packed('new', ['b', 'a'], 3)]), container);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ unitId: 'new', kind: 'relocate' });
    expect(moved[0].from.position[0]).toBeCloseTo(1 + .6 - 3, 12); expect(moved[0].to.position[0]).toBeCloseTo(3 + .6 - 3, 12);
    expect(buildStagingFlights(before, none, inventory([packed('new', ['a', 'c'], 3)]), container)).toEqual([]);
    expect(buildStagingFlights(before, none, inventory([packed('new', ['a'], 3)]), container)).toEqual([]);
    expect(buildStagingFlights(before, none, inventory([packed('same', ['a', 'b'], 1)]), container)).toEqual([]);
  });

  it('keeps one timeline when the same plan also brings units from the yard', () => {
    const before = inventory([unit('y'), at('a', 1)]), next = inventory([at('y', 3), at('a', 2)]);
    const flights = buildStagingFlights(before, layout([slot('y')]), next, container);
    expect(flights.map(flight => [flight.unitId, flight.kind, flight.durationMs, flight.delayMs])).toEqual([
      ['a', 'relocate', STAGING_FLIGHT_PROFILE.durationMs, 0], ['y', undefined, STAGING_FLIGHT_PROFILE.durationMs, STAGING_FLIGHT_PROFILE.maxStaggerMs]]);
    expect(flights[1].from.position).toEqual([9, -.8, 2]);
    expect(flights[0].from.position[0]).toBeCloseTo(worldX(1), 12);
  });

  it('never hops a unit from another vehicle, one also waiting in the yard, or an ambiguous member', () => {
    const elsewhere = at('a', 1, { location: 'other-vehicle' });
    expect(buildStagingFlights(inventory([elsewhere]), none, inventory([at('a', 3)]), container)).toEqual([]);
    expect(buildStagingFlights(inventory([at('a', 1), unit('dock', ['a'])]), layout([slot('dock')]), inventory([at('a', 3)]), container)).toEqual([]);
    expect(buildStagingFlights(inventory([at('a', 1), at('twin', 2, { boxUnits: [{ id: 'engine:twin', cargoId: 'SKU', stableId: 'a' }] })]),
      none, inventory([at('a', 3)]), container)).toEqual([]);
    expect(buildStagingFlights(inventory([at('a', 1)]), none, inventory([at('a', 3), at('a', 4)]), container)).toEqual([]);
    expect(buildStagingFlights(inventory([at('a', 1)]), none, inventory([at('a', 3)], 'different-input'), container)).toEqual([]);
    expect(buildStagingFlights(inventory([at('a', 1)]), none, inventory([at('a', NaN)]), container)).toEqual([]);
  });

  it('is deterministic, leaves both plans untouched and bounds three thousand hops to 1300ms', () => {
    const ids = Array.from({ length: 3000 }, (_, index) => String(index).padStart(4, '0'));
    const before = inventory(ids.map((id, index) => at(id, index))), next = inventory(ids.map((id, index) => at(id, index + 5000)));
    const snapshot = JSON.stringify([before, next]);
    const flights = buildStagingFlights(before, none, next, container);
    expect(flights).toHaveLength(3000);
    expect(flights.every(flight => flight.kind === 'relocate' && flight.durationMs === 900)).toBe(true);
    expect(flights[0].delayMs).toBe(0); expect(flights[2999].delayMs).toBe(STAGING_RELOCATION_PROFILE.maxStaggerMs);
    expect(flights.every(flight => flight.durationMs + flight.delayMs + STAGING_RELOCATION_PROFILE.prepareDurationMs <= 1300)).toBe(true);
    expect(STAGING_RELOCATION_PROFILE.liftHeight).toBeLessThan(STAGING_FLIGHT_PROFILE.liftHeight);
    expect(buildStagingFlights(inventory([...before.units].reverse()), none, inventory([...next.units].reverse()), container)).toEqual(flights);
    expect(JSON.stringify([before, next])).toBe(snapshot);
  });
});

function pallet(): PalletLoad {
  return { palletIndex: 4, x: 1, y: .5, z: .2, length: 1.2, width: 1, height: .15, stackLevel: 1, stackColumn: 1,
    cargoPlacements: [], cargoWeightKg: 2, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false,
    wrappingUsed: false, totalWeightKg: 2, centerOfGravity: { x: 1.6, y: 1, z: .4 } };
}
