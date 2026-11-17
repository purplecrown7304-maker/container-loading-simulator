// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clamp01, easeInOutCubic, easeInCubic, easeOutCubic, shortestAngleDelta } from './easing.js';

describe('motion easing', () => {
  it('clamps normalized values and keeps all cubic endpoints exact', () => {
    expect(clamp01(-Infinity)).toBe(0); expect(clamp01(Infinity)).toBe(1); expect(clamp01(NaN)).toBe(0);
    for (const ease of [easeInOutCubic, easeInCubic, easeOutCubic]) {
      expect(ease(-1)).toBe(0); expect(ease(0)).toBe(0); expect(ease(1)).toBe(1); expect(ease(2)).toBe(1);
    }
    expect(easeInOutCubic(.25)).toBe(.0625); expect(easeInOutCubic(.5)).toBe(.5); expect(easeInOutCubic(.75)).toBe(.9375);
    expect(easeInCubic(.5)).toBe(.125); expect(easeOutCubic(.5)).toBe(.875);
  });
  it('finds signed shortest turns across wrapped and unwrapped angles', () => {
    expect(shortestAngleDelta(0, Math.PI)).toBe(-Math.PI);
    expect(shortestAngleDelta(Math.PI * 1.5, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(shortestAngleDelta(.1, Math.PI * 2 - .1)).toBeCloseTo(-.2, 12);
    expect(shortestAngleDelta(Math.PI * 10, Math.PI * 12)).toBeCloseTo(0, 12);
    expect(shortestAngleDelta(Infinity, 0)).toBe(0);
    expect(Number.isFinite(shortestAngleDelta(1e308, -1e308))).toBe(true);
  });
});
