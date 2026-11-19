import { describe, expect, it } from 'vitest';
import { COLLIDER_VERTICAL_MARGIN_M, colliderHalfExtents } from './physicsColliders';

describe('simulated cuboid size', () => {
  it('keeps the planned footprint so touching neighbours stay in contact', () => {
    const carton = { length: 0.235, width: 0.13, height: 0.265 };
    const { halfLength, halfWidth } = colliderHalfExtents(carton);
    expect(halfLength * 2).toBe(carton.length);
    expect(halfWidth * 2).toBe(carton.width);
    // Two cartons side by side: the right face of one is the left face of the next.
    const first = { y: 0.005, ...carton };
    const second = { y: first.y + carton.width, ...carton };
    const firstRight = first.y + carton.width / 2 + halfWidth;
    const secondLeft = second.y + carton.width / 2 - halfWidth;
    expect(secondLeft - firstRight).toBeCloseTo(0, 12);
  });

  it('takes the settling margin off the height only', () => {
    const { halfHeight } = colliderHalfExtents({ length: 1, width: 1, height: 0.265 });
    expect(halfHeight).toBeCloseTo(0.265 / 2 - COLLIDER_VERTICAL_MARGIN_M, 12);
  });

  it('never returns a non-positive extent for a degenerate item', () => {
    const extents = colliderHalfExtents({ length: 0, width: 0, height: 0 });
    expect(extents.halfLength).toBeGreaterThan(0);
    expect(extents.halfWidth).toBeGreaterThan(0);
    expect(extents.halfHeight).toBeGreaterThan(0);
  });
});
