import { describe, expect, it } from 'vitest';
import { arrivalStartMs, arrivingOffset, departingOffset, dockShade, recallVehicleSwap, retargetVehicleSwap, VEHICLE_SWAP_PROFILE, vehicleIdentity, vehicleSwapTravel } from './vehicleSwapMotion';

const { leaveMs, arriveMs } = VEHICLE_SWAP_PROFILE;

describe('display-only equipment replacement timeline', () => {
  it('tells equipment apart by what is drawn, never by cargo or the request revision', () => {
    const base = { container: { length: 12.03, width: 2.35, height: 2.7 }, vehicle: 'container', vehicleRig: 'articulated', geometry: 'box', equipmentId: '40hc' };
    const withCargo = { ...base, revision: 9, placements: [{ id: 'a' }], selected: 3 };
    expect(vehicleIdentity(withCargo)).toBe(vehicleIdentity(base));
    for (const change of [{ container: { ...base.container, length: 5.9 } }, { container: { ...base.container, height: 2.4 } }, { vehicleRig: 'rigid' }, { geometry: 'flatrack' }, { equipmentId: '40st' }, { vehicle: 'truck' }]) {
      expect(vehicleIdentity({ ...base, ...change })).not.toBe(vehicleIdentity(base));
    }
    // Missing optional descriptors are one identity, not a difference from each other.
    expect(vehicleIdentity({ container: base.container })).toBe(vehicleIdentity({ container: base.container, vehicle: undefined, equipmentId: undefined }));
  });

  it('travels far enough for the longer of the two and never less than the minimum', () => {
    expect(vehicleSwapTravel(5.9, 2.4)).toBe(VEHICLE_SWAP_PROFILE.minTravelM);
    expect(vehicleSwapTravel(5.9, 13.56)).toBeCloseTo(13.56 * VEHICLE_SWAP_PROFILE.travelPerLength);
    expect(vehicleSwapTravel(13.56, 5.9)).toBe(vehicleSwapTravel(5.9, 13.56));
    expect(vehicleSwapTravel(NaN, -4, Infinity)).toBe(VEHICLE_SWAP_PROFILE.minTravelM);
  });

  it('pulls away from rest toward the cab end and is exactly gone at the end', () => {
    const atRest = departingOffset(0, 30);
    expect(atRest.offset).toBeCloseTo(0); expect(atRest.done).toBe(false);
    const early = departingOffset(leaveMs * .25, 30), half = departingOffset(leaveMs * .5, 30), late = departingOffset(leaveMs * .75, 30);
    expect(half.offset).toBeCloseTo(-30 * .125);
    // Each quarter covers more ground than the one before.
    expect(Math.abs(early.offset)).toBeLessThan(Math.abs(half.offset - early.offset));
    expect(Math.abs(half.offset - early.offset)).toBeLessThan(Math.abs(late.offset - half.offset));
    expect(departingOffset(leaveMs, 30)).toEqual({ offset: -30, done: true });
    expect(departingOffset(leaveMs * 40, 30)).toEqual({ offset: -30, done: true });
    expect(departingOffset(NaN, 30)).toEqual({ offset: -30, done: true });
  });

  it('leaves from where the equipment stands when it was itself still arriving', () => {
    expect(departingOffset(0, 30, -8).offset).toBe(-8);
    expect(departingOffset(leaveMs * .5, 30, -8).offset).toBeCloseTo(-8 - 22 * .125);
    expect(departingOffset(leaveMs, 30, -8)).toEqual({ offset: -30, done: true });
    // It never starts beyond either end of the lane.
    expect(departingOffset(0, 30, 5).offset).toBeCloseTo(0); expect(departingOffset(0, 30, -99).offset).toBe(-30);
    expect(departingOffset(0, 30, NaN).offset).toBeCloseTo(0);
  });

  it('starts the arrival only after the lane is clear and after its own models are ready', () => {
    expect(arrivalStartMs(200, true)).toBe(leaveMs);
    expect(arrivalStartMs(leaveMs + 400, true)).toBe(leaveMs + 400);
    expect(arrivalStartMs(350, false)).toBe(350);
    expect(arrivalStartMs(NaN, false)).toBe(0); expect(arrivalStartMs(-5, true)).toBe(leaveMs);
    // The two are never on the lane together.
    const start = arrivalStartMs(0, true);
    for (let elapsed = 0; elapsed <= start + arriveMs; elapsed += 50) {
      expect(!departingOffset(elapsed, 30).done && arrivingOffset(elapsed, start, 30).started).toBe(false);
    }
  });

  it('keeps the arriving equipment unseen at the far end, then slows into exactly the dock', () => {
    expect(arrivingOffset(leaveMs - 1, leaveMs, 30)).toEqual({ offset: -30, started: false, done: false });
    expect(arrivingOffset(leaveMs, leaveMs, 30)).toEqual({ offset: -30, started: true, done: false });
    const early = arrivingOffset(leaveMs + arriveMs * .25, leaveMs, 30), half = arrivingOffset(leaveMs + arriveMs * .5, leaveMs, 30), late = arrivingOffset(leaveMs + arriveMs * .75, leaveMs, 30);
    expect(half.offset).toBeCloseTo(-30 * .125);
    expect(early.offset + 30).toBeGreaterThan(half.offset - early.offset);
    expect(half.offset - early.offset).toBeGreaterThan(late.offset - half.offset);
    expect(arrivingOffset(leaveMs + arriveMs, leaveMs, 30)).toEqual({ offset: 0, started: true, done: true });
    expect(arrivingOffset(leaveMs + arriveMs * 9, leaveMs, 30)).toEqual({ offset: 0, started: true, done: true });
    expect(arrivingOffset(NaN, leaveMs, 30)).toEqual({ offset: -30, started: false, done: false });
  });

  it('keeps one departure when equipment is changed again before the first change has finished', () => {
    const sceneA = { name: 'A' }, sceneB = { name: 'B' };
    const leaveA = { id: 1, departing: sceneA, from: 0, startedAt: 100, travel: 30, identity: 'B' };
    // Nothing under way: the scene on screen leaves.
    expect(retargetVehicleSwap(null, leaveA, false)).toBe(leaveA);
    // A is still leaving, whether or not B has loaded behind it: only the arrival changes.
    const toC = { id: 2, departing: sceneB, from: 0, startedAt: 600, travel: 34, identity: 'C' };
    expect(retargetVehicleSwap(leaveA, toC, false)).toEqual({ ...leaveA, identity: 'C', travel: 34 });
    expect(retargetVehicleSwap(leaveA, { ...toC, travel: 12 }, false).travel).toBe(30);
    // A has gone and is still the live scene because B never loaded: it does not leave twice.
    const gone = { ...leaveA, departing: null };
    expect(retargetVehicleSwap(gone, { ...toC, departing: sceneA }, true)).toEqual({ ...gone, identity: 'C', travel: 34 });
    // A has gone and B is on its way in: B leaves from where it stands.
    const leaveB = { ...toC, from: -9 };
    expect(retargetVehicleSwap(gone, leaveB, false)).toBe(leaveB);
    expect(JSON.stringify(leaveA)).toBe(JSON.stringify({ id: 1, departing: sceneA, from: 0, startedAt: 100, travel: 30, identity: 'B' }));
  });

  it('lets equipment that is asked for again stay, or come back if it had already left', () => {
    const sceneA = { name: 'A' }, sceneB = { name: 'B' };
    const leaveA = { id: 1, departing: sceneA, from: 0, startedAt: 100, travel: 30, identity: 'B' };
    expect(recallVehicleSwap(null, sceneA, 'A')).toBeNull();
    // Still driving off: the replacement is called off.
    expect(recallVehicleSwap(leaveA, sceneA, 'A')).toBeNull();
    // Already gone: the same replacement now brings it back.
    const gone = { ...leaveA, departing: null };
    expect(recallVehicleSwap(gone, sceneA, 'A')).toEqual({ ...gone, identity: 'A' });
    // Waiting behind another departure after a third choice: it is what arrives after all.
    const toC = { ...leaveA, identity: 'C' };
    expect(recallVehicleSwap(toC, sceneB, 'B')).toEqual({ ...leaveA, identity: 'B' });
    // A re-published identical plan during its own arrival changes nothing.
    const arriving = { ...gone, identity: 'B' };
    expect(recallVehicleSwap(arriving, sceneB, 'B')).toBe(arriving);
  });

  it('shades the dock only while equipment stands on or near its footprint', () => {
    const reach = 30 * VEHICLE_SWAP_PROFILE.shadeReach;
    expect(dockShade(0, 30)).toBe(1); expect(dockShade(-0, 30)).toBe(1);
    expect(dockShade(-reach / 2, 30)).toBeCloseTo(.5); expect(dockShade(reach / 2, 30)).toBeCloseTo(.5);
    expect(dockShade(-reach, 30)).toBe(0); expect(dockShade(-30, 30)).toBe(0);
    // Unusable input leaves the shade as it is drawn without a replacement.
    expect(dockShade(NaN, 30)).toBe(1); expect(dockShade(-4, 0)).toBe(1);
  });
});
