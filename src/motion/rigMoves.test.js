import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { RigMoveManager } from './rigMoves.js';

function rig() {
  const root = new Group(), wheels = [new Group(), new Group()]; root.add(...wheels);
  return { root, wheels, wheelRadius: .5, doorPoint: new Vector3(2, 1, 0), parkX: 10, offX: -10 };
}
const world = root => root.getWorldPosition(new Vector3());

describe('production rig move manager', () => {
  it('waits for its start, eases world X and rolls wheels by displacement with one completion', () => {
    const manager = new RigMoveManager(), moving = rig(), done = vi.fn();
    moving.root.position.set(0, 3, 4); moving.root.visible = false;
    manager.schedule({ rig: moving, x0: -10, x1: 10, t0: 2, d: 2, ease: 'in', onDone: done });
    expect(manager.isBusy).toBe(true); expect(moving.root.visible).toBe(true);
    manager.update(1); expect(world(moving.root).toArray()).toEqual([-10, 3, 4]);
    manager.update(3); expect(world(moving.root).x).toBeCloseTo(-7.5);
    moving.wheels.forEach(wheel => expect(wheel.rotation.z).toBeCloseTo(-5));
    manager.update(4); expect(world(moving.root).toArray()).toEqual([10, 3, 4]);
    moving.wheels.forEach(wheel => expect(wheel.rotation.z).toBeCloseTo(-40));
    expect(manager.isBusy).toBe(false); expect(done).toHaveBeenCalledOnce();
    manager.update(99); manager.skip(); expect(done).toHaveBeenCalledOnce();
  });
  it('rolls the opposite direction, hides only at the exact exit and skips once', () => {
    const manager = new RigMoveManager(), moving = rig(), done = vi.fn();
    manager.schedule({ rig: moving, x0: 10, x1: -6, t0: 0, d: 2, ease: 'out', hideAfter: true, onDone: done });
    manager.update(1); expect(world(moving.root).x).toBeCloseTo(-4); expect(moving.root.visible).toBe(true);
    moving.wheels.forEach(wheel => expect(wheel.rotation.z).toBeCloseTo(28));
    manager.skip(); expect(world(moving.root).x).toBe(-6); expect(moving.root.visible).toBe(false);
    moving.wheels.forEach(wheel => expect(wheel.rotation.z).toBeCloseTo(32));
    expect(done).toHaveBeenCalledOnce(); expect(manager.isBusy).toBe(false);
  });
  it('replaces an active destination continuously and never completes its superseded request', () => {
    const manager = new RigMoveManager(), moving = rig(), superseded = vi.fn(), done = vi.fn();
    manager.schedule({ rig: moving, x0: 0, x1: 10, t0: 0, d: 1, onDone: superseded });
    manager.update(.5); const pose = world(moving.root).x, wheel = moving.wheels[0].rotation.z;
    manager.schedule({ rig: moving, x0: -100, x1: 20, t0: .5, d: 1, onDone: done });
    expect(world(moving.root).x).toBe(pose); expect(moving.wheels[0].rotation.z).toBe(wheel);
    manager.update(1.5); expect(world(moving.root).x).toBe(20);
    moving.wheels.forEach(part => expect(part.rotation.z).toBeCloseTo(-40));
    expect(superseded).not.toHaveBeenCalled(); expect(done).toHaveBeenCalledOnce();
  });
  it('supports immediate moves, independent rigs and cancellation without owning model disposal', () => {
    const manager = new RigMoveManager(), first = rig(), second = rig(), done = vi.fn();
    manager.schedule({ rig: first, x0: -10, x1: 10, t0: 50, d: 0, hideAfter: true, onDone: done });
    expect(world(first.root).x).toBe(10); expect(first.root.visible).toBe(false);
    expect(first.wheels[0].rotation.z).toBeCloseTo(-40); expect(done).toHaveBeenCalledOnce(); expect(manager.isBusy).toBe(false);
    manager.schedule({ rig: first, x0: 0, x1: 10, t0: 0, d: 2, onDone: done });
    manager.schedule({ rig: second, x0: 0, x1: -10, t0: 0, d: 2, onDone: done });
    manager.update(1); const pose = world(first.root).toArray(), wheel = first.wheels[0].rotation.z;
    manager.clear(); manager.update(3); manager.skip(); expect(manager.isBusy).toBe(false);
    expect(world(first.root).toArray()).toEqual(pose); expect(first.wheels[0].rotation.z).toBe(wheel); expect(done).toHaveBeenCalledOnce();
    const childCount = first.root.children.length; manager.dispose(); manager.dispose();
    expect(first.root.children).toHaveLength(childCount); expect(() => manager.schedule({ rig: first, x0: 0, x1: 1, t0: 0, d: 1 })).toThrow(/disposed/);
  });
  it('retains world Y/Z under translated, rotated, scaled nested parents without per-frame scratch replacement', () => {
    const manager = new RigMoveManager(), moving = rig(), outer = new Group(), parent = new Group();
    outer.position.set(5, -2, 7); outer.rotation.y = .7; outer.scale.set(2, 3, .8);
    parent.position.set(2, 3, -1); parent.rotation.z = .4; outer.add(parent); parent.add(moving.root); moving.root.position.set(1, 2, 3);
    const original = world(moving.root), door = moving.doorPoint.toArray(), scratch = [manager._world, manager._local];
    manager.schedule({ rig: moving, x0: original.x, x1: original.x + 8, t0: 0, d: 1 });
    for (let frame = 1; frame <= 10; frame++) manager.update(frame / 10);
    const result = world(moving.root); expect(result.x).toBeCloseTo(original.x + 8);
    expect(result.y).toBeCloseTo(original.y); expect(result.z).toBeCloseTo(original.z);
    moving.wheels.forEach(wheel => expect(wheel.rotation.z).toBeCloseTo(-16));
    expect(moving.doorPoint.toArray()).toEqual(door); expect(manager._world).toBe(scratch[0]); expect(manager._local).toBe(scratch[1]);
  });
  it('rejects invalid schedules atomically and ignores invalid timestamps without poisoning poses', () => {
    const manager = new RigMoveManager(), moving = rig(), done = vi.fn();
    const options = { rig: moving, x0: 0, x1: 10, t0: 0, d: 1, onDone: done };
    manager.schedule(options); manager.update(.25); const initial = world(moving.root).toArray(), wheel = moving.wheels[0].rotation.z;
    for (const change of [{ x0: NaN }, { x1: Infinity }, { t0: NaN }, { d: -1 }, { d: Infinity }, { ease: 'linear' }, { x0: -Number.MAX_VALUE, x1: Number.MAX_VALUE }]) {
      expect(() => manager.schedule({ ...options, ...change })).toThrow(RangeError);
      expect(world(moving.root).toArray()).toEqual(initial); expect(moving.wheels[0].rotation.z).toBe(wheel);
    }
    manager.update(NaN); manager.update(Infinity); expect(world(moving.root).toArray()).toEqual(initial);
    expect(manager.isBusy).toBe(true); manager.skip(); expect(done).toHaveBeenCalledOnce();
    const bad = rig(); bad.wheelRadius = 0; expect(() => manager.schedule({ ...options, rig: bad })).toThrow(RangeError);
    const singular = new Group(); singular.scale.x = 0; singular.add(bad.root); bad.wheelRadius = .5;
    expect(() => manager.schedule({ ...options, rig: bad })).toThrow(RangeError);
  });
  it('leaves a newly scheduled callback move for the following frame', () => {
    const manager = new RigMoveManager(), moving = rig(), finish = vi.fn();
    manager.schedule({ rig: moving, x0: 0, x1: 10, t0: 0, d: 1, onDone: () => manager.schedule({ rig: moving, x0: 10, x1: 20, t0: 1, d: 1, onDone: finish }) });
    manager.update(1); expect(world(moving.root).x).toBe(10); expect(manager.isBusy).toBe(true); expect(finish).not.toHaveBeenCalled();
    manager.update(2); expect(world(moving.root).x).toBe(20); expect(finish).toHaveBeenCalledOnce(); expect(manager.isBusy).toBe(false);
  });
  it('keeps insertion order and reused storage without Map or wheel iterators in the frame path', () => {
    const manager = new RigMoveManager(), first = rig(), second = rig(), third = rig(), order = [];
    manager.schedule({ rig: first, x0: 0, x1: 1, t0: 0, d: 1, onDone: () => {
      order.push('first'); manager.schedule({ rig: third, x0: 0, x1: 3, t0: 0, d: 1, onDone: () => order.push('third') });
    } });
    manager.schedule({ rig: second, x0: 0, x1: 2, t0: 0, d: 1, onDone: () => order.push('second') });
    const active = manager._active;
    const values = vi.spyOn(manager._moves, 'values').mockImplementation(() => { throw new Error('frame iterator allocated'); });
    Object.defineProperty(first.wheels, Symbol.iterator, { value: () => { throw new Error('wheel iterator allocated'); } });
    for (let frame = 0; frame < 4; frame++) manager.update(frame / 4);
    manager.update(1); expect(order).toEqual(['first', 'second']); expect(world(third.root).x).toBe(0);
    manager.update(1); expect(order).toEqual(['first', 'second', 'third']); expect(manager.isBusy).toBe(false);
    expect(manager._active).toBe(active); expect(active).toHaveLength(0); expect(values).not.toHaveBeenCalled();
    manager.clear(); expect(manager._active).toBe(active);
  });
  it('handles callback cancellation/replacement without advancing new jobs in the same update', () => {
    const manager = new RigMoveManager(), first = rig(), cancelled = rig(), next = rig(), done = vi.fn(), old = vi.fn();
    manager.schedule({ rig: first, x0: 0, x1: 1, t0: 0, d: 1, onDone: () => {
      manager.clear(); manager.schedule({ rig: next, x0: 4, x1: 8, t0: 0, d: 1, onDone: done });
    } });
    manager.schedule({ rig: cancelled, x0: 0, x1: 2, t0: 0, d: 1, onDone: old });
    manager.update(1); expect(world(next.root).x).toBe(4); expect(done).not.toHaveBeenCalled(); expect(old).not.toHaveBeenCalled();
    manager.update(1); expect(world(next.root).x).toBe(8); expect(done).toHaveBeenCalledOnce(); expect(manager.isBusy).toBe(false);
  });
  it('skips original jobs in order while preserving a callback-scheduled move for a later skip', () => {
    const manager = new RigMoveManager(), first = rig(), second = rig(), order = [];
    manager.schedule({ rig: first, x0: 0, x1: 1, t0: 0, d: 1, onDone: () => {
      order.push('first'); manager.schedule({ rig: first, x0: 1, x1: 4, t0: 1, d: 1, onDone: () => order.push('new') });
    } });
    manager.schedule({ rig: second, x0: 0, x1: 2, t0: 0, d: 1, onDone: () => order.push('second') });
    manager.skip(); expect(order).toEqual(['first', 'second']); expect(world(first.root).x).toBe(1); expect(manager.isBusy).toBe(true);
    manager.skip(); expect(order).toEqual(['first', 'second', 'new']); expect(world(first.root).x).toBe(4); expect(manager.isBusy).toBe(false);
  });
});
