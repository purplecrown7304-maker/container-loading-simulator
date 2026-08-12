import { describe, expect, it } from 'vitest';
import { assessShapeQuality } from './shapeQuality';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.4, maxPayloadKg: 10000 };
const box = (overrides: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.6, width: 0.4, height: 0.4, weightKg: 10, ...overrides });

describe('assessShapeQuality', () => {
  it('does not penalize a compact contiguous block', () => {
    const placements = [
      box({ x: 0, y: 0 }), box({ x: 0, y: 0.4 }), box({ x: 0.6, y: 0 }), box({ x: 0.6, y: 0.4 }),
    ];
    const result = assessShapeQuality(container, placements);
    expect(result.isolatedMiddleBoxes).toBe(0);
    expect(result.fragmentedCargoTypes).toBe(0);
  });

  it('detects an isolated box placed in the middle', () => {
    const placements = [box({ x: 1.2, y: 1.0 })];
    const result = assessShapeQuality(container, placements);
    expect(result.isolatedMiddleBoxes).toBe(1);
    expect(result.shapePenalty).toBeGreaterThan(0);
  });

  it('detects the same cargo fragmented into several disconnected regions', () => {
    const placements = [
      box({ x: 0, y: 0 }), box({ x: 0, y: 0.4 }),
      box({ x: 2.4, y: 0 }), box({ x: 2.4, y: 0.4 }),
      box({ x: 4.8, y: 0 }), box({ x: 4.8, y: 0.4 }),
    ];
    const result = assessShapeQuality(container, placements);
    expect(result.fragmentedCargoTypes).toBe(1);
    expect(result.shapePenalty).toBeGreaterThanOrEqual(7);
  });
});
