import { describe, expect, it } from 'vitest';
import { assessPlacementSupport, hasAdequateSupport } from './support';
import type { Placement } from './types';

const box = (overrides: Partial<Placement> = {}): Placement => ({
  cargoId: 'BOX',
  x: 0,
  y: 0,
  z: 0,
  length: 1,
  width: 1,
  height: 0.4,
  weightKg: 10,
  ...overrides,
});

describe('physical support validity', () => {
  it('accepts a box resting on the floor', () => {
    expect(hasAdequateSupport(box(), [])).toBe(true);
  });

  it('rejects a large box supported by only a small corner', () => {
    const lower = box({ length: 0.4, width: 0.4 });
    const upper = box({ z: 0.4, length: 0.8, width: 0.8 });
    const result = assessPlacementSupport(upper, [lower]);
    expect(result.supportRatio).toBeCloseTo(0.25, 5);
    expect(result.supported).toBe(false);
  });

  it('accepts a bridged box when enough area supports it and its center stays within the support envelope', () => {
    const left = box({ x: 0, y: 0, length: 0.4, width: 1 });
    const right = box({ x: 0.6, y: 0, length: 0.4, width: 1 });
    const upper = box({ z: 0.4, length: 1, width: 1 });
    const result = assessPlacementSupport(upper, [left, right]);
    expect(result.supportRatio).toBeCloseTo(0.8, 5);
    expect(result.centerInsideSupportEnvelope).toBe(true);
    expect(result.supported).toBe(true);
  });
});
