import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { damp, damp3 } from './damp.js';

describe('production frame-independent damping', () => {
  it('converges to the same one-second pose at 60 and 144 Hz without overshoot', () => {
    const run = fps => { let value = -8; for (let frame = 0; frame < fps; frame++) value = damp(value, 12, .2, 1 / fps); return value; };
    expect(Math.abs(run(60) - run(144))).toBeLessThan(.001);
    expect(run(60)).toBeCloseTo(12 - 20 * Math.exp(-5), 10);
    expect(run(144)).toBeGreaterThan(-8); expect(run(144)).toBeLessThan(12);
    expect(damp(12, -8, .2, .03)).toBeLessThan(12); expect(damp(12, -8, .2, .03)).toBeGreaterThan(-8);
  });
  it('mutates the existing Vector3, preserves the target and composes elapsed time', () => {
    const start = new Vector3(-1, 3, 6), target = new Vector3(5, -9, 12), before = target.toArray();
    const once = damp3(start.clone(), target, .1, .03);
    const twice = start.clone(); expect(damp3(twice, target, .1, .01)).toBe(twice); damp3(twice, target, .1, .02);
    expect(once.distanceTo(twice)).toBeLessThan(1e-12); expect(target.toArray()).toEqual(before);
    expect(damp3(start, start, .1, .1)).toBe(start); expect(start.toArray()).toEqual([-1, 3, 6]);
  });
  it('handles zero/invalid dt, snap constants and finite numeric extremes without poisoning a transform', () => {
    for (const dt of [0, -1, NaN, Infinity]) expect(damp(2, 10, .1, dt)).toBe(2);
    for (const tau of [0, -1]) expect(damp(2, 10, tau, .01)).toBe(10);
    expect(damp(2, 10)).toBe(2); expect(damp(2, Infinity, .1, .1)).toBe(2);
    expect(damp(NaN, 10, .1, .1)).toBe(10); expect(damp(NaN, NaN, .1, .1)).toBe(0);
    expect(Number.isFinite(damp(-Number.MAX_VALUE, Number.MAX_VALUE, .1, .01))).toBe(true);
    expect(Number.isFinite(damp(2, 10, NaN, .01))).toBe(true);
  });
});
