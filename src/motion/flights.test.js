// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FlightManager } from './flights.js';

const pose = (x = 0, y = 0, z = 0, ry = 0) => ({ x, y, z, ry });
function fixture() {
  const poses = new Map([['a', pose()], ['b', pose()], ['c', pose()]]), received = [];
  const adapter = {
    getPose(id, out) { const value = poses.get(id); if (!value) return false; Object.assign(out, value); return true; },
    setPose(id, value) { const target = poses.get(id); if (!target) return false; received.push(value); Object.assign(target, value); return true; },
  };
  const onLanded = vi.fn(), manager = new FlightManager({ adapter, onLanded });
  return { poses, adapter, received, onLanded, manager };
}
const flight = (extra = {}) => ({ id: 'a', a: pose(), b: pose(10, 0, 0, Math.PI / 2), arc: 0, t0: 2, d: 2, ...extra });

describe('FlightManager', () => {
  it('uses the caller clock, eased position/yaw, delayed start and exact final unwrapped pose once', () => {
    const { manager, poses, onLanded } = fixture(), onDone = vi.fn();
    const b = pose(10, 3, 2, Math.PI * 2 + .3);
    manager.schedule(flight({ a: pose(0, 1, 0, -.3), b, onDone }));
    manager.update(1); expect(poses.get('a')).toEqual(pose());
    manager.update(2); expect(poses.get('a')).toEqual(pose(0, 1, 0, -.3));
    manager.update(2.5); expect(poses.get('a').x).toBe(.625); expect(poses.get('a').ry).toBeCloseTo(-.2625, 12);
    manager.update(3); expect(poses.get('a').x).toBe(5); expect(poses.get('a').ry).toBeCloseTo(0, 12);
    manager.update(4); expect(poses.get('a')).toEqual(b); expect(manager.isBusy()).toBe(false);
    manager.update(40); manager.skip(); expect(onDone).toHaveBeenCalledExactlyOnceWith('a'); expect(onLanded).toHaveBeenCalledExactlyOnceWith('a');
  });
  it('applies exactly the quadratic control-point equation with no extra arc when via is supplied', () => {
    const { manager, poses } = fixture();
    manager.schedule(flight({ a: pose(), b: pose(10, 0, 0, Math.PI / 2), via: { x: 4, y: 6, z: 2 }, arc: 99 }));
    manager.update(3); expect(poses.get('a')).toEqual(pose(4.5, 3, 1, Math.PI / 4));
  });
  it('uses the exact sinusoidal distance-scaled arc without a control point', () => {
    const { manager, poses } = fixture();
    manager.schedule(flight({ a: pose(0, 1), b: pose(10, 5), arc: 2 }));
    manager.update(3); expect(poses.get('a')).toEqual(pose(5, 6.2));
    manager.update(4); expect(poses.get('a')).toEqual(pose(10, 5));
  });
  it('holds the prepared source, takes off vertically, cruises horizontally and lands vertically at the exact pose', () => {
    const { manager, poses, received } = fixture(), done = vi.fn();
    const a = pose(2, 1, -4, -.3), b = pose(10, 2, 3, Math.PI * 2 + .3);
    manager.schedule(flight({ a, b, path: 'vertical', cruiseY: 6, liftHeight: 1, prepareDuration: .3,
      ascentRatio: .25, descentRatio: .25, via: { x: 999, y: 999, z: 999 }, arc: 99, onDone: done }));
    manager.update(2); manager.update(2.2); expect(poses.get('a')).toEqual(a);
    manager.update(2.55); const ascending = { ...poses.get('a') };
    expect(ascending.x).toBe(a.x); expect(ascending.z).toBe(a.z); expect(ascending.ry).toBe(a.ry);
    expect(ascending.y).toBeGreaterThan(a.y); expect(ascending.y).toBeLessThan(6);
    manager.update(3.3); const cruising = { ...poses.get('a') };
    expect(cruising.y).toBe(6); expect(cruising.x).toBeCloseTo(6, 12); expect(cruising.z).toBeCloseTo(-.5, 12);
    expect(cruising.ry).toBeCloseTo(0, 12);
    manager.update(4.05); const descending = poses.get('a');
    expect(descending.x).toBe(b.x); expect(descending.z).toBe(b.z); expect(descending.ry).toBe(b.ry);
    expect(descending.y).toBeGreaterThan(b.y); expect(descending.y).toBeLessThan(6);
    expect(done).not.toHaveBeenCalled(); manager.update(4.3);
    expect(poses.get('a')).toEqual(b); expect(done).toHaveBeenCalledTimes(1); expect(new Set(received).size).toBe(1);
  });
  it('raises cruise altitude above higher endpoints and keeps interrupted vertical flights continuous', () => {
    const { manager, poses } = fixture(), oldDone = vi.fn(), nextDone = vi.fn();
    manager.schedule(flight({ a: pose(1, 5, 2), b: pose(10, 8, 3), path: 'vertical', cruiseY: 4, liftHeight: 2, onDone: oldDone }));
    manager.update(3); expect(poses.get('a').y).toBe(10); const current = { ...poses.get('a') };
    manager.schedule(flight({ a: pose(-99), b: pose(20, 1, 6), t0: 3, path: 'vertical', prepareDuration: .3, onDone: nextDone }));
    manager.update(3.2); expect(poses.get('a')).toEqual(current);
    manager.update(3.5); expect(poses.get('a').x).toBe(current.x); expect(poses.get('a').z).toBe(current.z);
    manager.skip(); expect(poses.get('a')).toEqual(pose(20, 1, 6)); expect(oldDone).not.toHaveBeenCalled(); expect(nextDone).toHaveBeenCalledTimes(1);
  });
  it('keeps zero-duration/reduced vertical requests immediate at their scheduled start', () => {
    const { manager, poses } = fixture(), done = vi.fn();
    manager.schedule(flight({ d: 0, prepareDuration: .3, path: 'vertical', onDone: done }));
    manager.update(1); expect(done).not.toHaveBeenCalled(); manager.update(2);
    expect(poses.get('a')).toEqual(pose(10, 0, 0, Math.PI / 2)); expect(done).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid path settings before replacing a current request', () => {
    const { manager } = fixture(); manager.schedule(flight());
    for (const settings of [{ path: 'other' }, { prepareDuration: -1 }, { cruiseY: NaN }, { liftHeight: Infinity },
      { ascentRatio: 0 }, { descentRatio: 1 }, { ascentRatio: .6, descentRatio: .4 }]) {
      expect(() => manager.schedule(flight(settings))).toThrow(RangeError); expect(manager.size).toBe(1);
    }
  });
  it('preempts from the current adapter pose and suppresses the replaced callback', () => {
    const { manager, poses, onLanded } = fixture(), oldDone = vi.fn(), nextDone = vi.fn();
    manager.schedule(flight({ onDone: oldDone })); manager.update(3);
    Object.assign(poses.get('a'), pose(7, 2, 1, .4));
    const current = { ...poses.get('a') };
    manager.schedule(flight({ a: pose(-100, -100, -100), b: pose(20, 0, 0, -.4), t0: 3, onDone: nextDone }));
    manager.update(3); expect(poses.get('a')).toEqual(current);
    manager.update(5); expect(poses.get('a')).toEqual(pose(20, 0, 0, -.4));
    expect(oldDone).not.toHaveBeenCalled(); expect(nextDone).toHaveBeenCalledTimes(1); expect(onLanded).toHaveBeenCalledTimes(1);
  });
  it('skip lands all current flights once, including future start times', () => {
    const { manager, poses, onLanded } = fixture(), done = vi.fn();
    manager.schedule(flight({ onDone: done })); manager.schedule(flight({ id: 'b', b: pose(4, 5, 6, 9), t0: 99, onDone: done }));
    manager.skip(); manager.skip();
    expect(poses.get('a')).toEqual(pose(10, 0, 0, Math.PI / 2)); expect(poses.get('b')).toEqual(pose(4, 5, 6, 9));
    expect(done).toHaveBeenCalledTimes(2); expect(onLanded).toHaveBeenCalledTimes(2); expect(manager.size).toBe(0);
  });
  it('waits for a future zero-duration start, then snaps exactly once on the caller update', () => {
    const { manager, poses, received, onLanded } = fixture(), done = vi.fn();
    Object.assign(poses.get('a'), pose(99));
    manager.schedule(flight({ d: 0, t0: 5, onDone: done }));
    expect(received).toHaveLength(0); expect(done).not.toHaveBeenCalled();
    manager.update(4); expect(poses.get('a')).toEqual(pose(99)); expect(done).not.toHaveBeenCalled();
    manager.update(5); expect(poses.get('a')).toEqual(pose(10, 0, 0, Math.PI / 2));
    manager.update(6); expect(done).toHaveBeenCalledTimes(1); expect(onLanded).toHaveBeenCalledTimes(1);
    manager.schedule(flight({ id: 'b', d: 0, t0: 100, onDone: done })); manager.skip();
    expect(poses.get('b')).toEqual(pose(10, 0, 0, Math.PI / 2)); expect(done).toHaveBeenCalledTimes(2);
  });
  it.each(['update', 'skip'])('%s preserves callback-scheduled work for the next pass', operation => {
    const { manager, poses, onLanded } = fixture(), nextDone = vi.fn();
    manager.schedule(flight({ onDone: () => manager.schedule(flight({ id: 'b', a: pose(2), b: pose(4), t0: 0, d: 1, onDone: nextDone })) }));
    if (operation === 'update') manager.update(4); else manager.skip();
    expect(manager.size).toBe(1); expect(poses.get('b')).toEqual(pose()); expect(nextDone).not.toHaveBeenCalled();
    manager.update(5); expect(poses.get('b')).toEqual(pose(4)); expect(nextDone).toHaveBeenCalledTimes(1); expect(onLanded).toHaveBeenCalledTimes(2);
  });
  it('supports same-ID callback chaining without deleting the newly registered request', () => {
    const { manager, poses } = fixture(), nextDone = vi.fn();
    manager.schedule(flight({ onDone: () => manager.schedule(flight({ a: pose(10), b: pose(20), t0: 4, d: 1, onDone: nextDone })) }));
    manager.update(4); expect(manager.size).toBe(1); expect(poses.get('a').x).toBe(10);
    manager.update(5); expect(poses.get('a')).toEqual(pose(20)); expect(nextDone).toHaveBeenCalledTimes(1);
  });
  it('cancels removed bindings once and rejects missing schedule without replacing active work', () => {
    const { manager, poses, onLanded } = fixture(), done = vi.fn();
    manager.schedule(flight({ onDone: done })); poses.delete('a');
    expect(() => manager.schedule(flight())).toThrow(/not registered/);
    expect(manager.size).toBe(1); manager.update(2.5); manager.update(4); manager.skip();
    expect(manager.size).toBe(0); expect(done).toHaveBeenCalledTimes(1); expect(onLanded).toHaveBeenCalledTimes(1);
  });
  it.each(['update', 'skip'])('%s finishes the other current requests even if a landing callback throws', operation => {
    const { manager, poses, onLanded } = fixture(), second = vi.fn();
    manager.schedule(flight({ onDone: () => { throw new Error('callback failure'); } }));
    manager.schedule(flight({ id: 'b', b: pose(20), onDone: second }));
    expect(() => operation === 'skip' ? manager.skip() : manager.update(4)).toThrow('callback failure');
    expect(manager.size).toBe(0); expect(poses.get('b')).toEqual(pose(20));
    expect(second).toHaveBeenCalledTimes(1); expect(onLanded).toHaveBeenCalledTimes(2);
  });
  it('cancel, clear and dispose never run landing callbacks or snap cancelled poses', () => {
    const { manager, poses, onLanded } = fixture(), done = vi.fn();
    manager.schedule(flight({ onDone: done })); manager.update(3); const current = { ...poses.get('a') };
    expect(manager.cancel('a')).toBe(true); expect(manager.cancel('a')).toBe(false); manager.update(4); expect(poses.get('a')).toEqual(current);
    manager.schedule(flight({ onDone: done })); manager.clear(); manager.update(4);
    manager.schedule(flight({ onDone: done })); manager.dispose(); manager.update(4); manager.skip();
    expect(done).not.toHaveBeenCalled(); expect(onLanded).not.toHaveBeenCalled(); expect(() => manager.schedule(flight())).toThrow(/disposed/);
  });
  it('copies request data and reuses one pose object across frame updates', () => {
    const { manager, received, poses } = fixture(), input = flight({ via: { x: 0, y: 3, z: 0 } });
    const snapshot = structuredClone(input); manager.schedule(input);
    manager.update(2.1); manager.update(2.2); manager.update(3); manager.update(4);
    expect(new Set(received).size).toBe(1); expect(input).toEqual(snapshot); expect(poses.get('a')).toEqual(snapshot.b);
    input.b.x = -999; expect(poses.get('a').x).toBe(10);
  });
  it('validates clock, endpoints, durations, adapters and callbacks before writes', () => {
    expect(() => new FlightManager()).toThrow(/adapter/);
    const { manager, received } = fixture();
    for (const invalid of [flight({ a: pose(NaN) }), flight({ b: pose(0, 0, Infinity) }), flight({ via: { x: 0, y: NaN, z: 0 } }),
      flight({ d: -1 }), flight({ d: Infinity }), flight({ t0: NaN }), flight({ arc: Infinity })]) expect(() => manager.schedule(invalid)).toThrow(RangeError);
    expect(() => manager.update(NaN)).toThrow(RangeError); expect(received).toHaveLength(0);
  });
});
