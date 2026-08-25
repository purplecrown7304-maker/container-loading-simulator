import { describe, expect, it } from 'vitest';
import type { PhysicsSupport } from './physicsValidation';
import type { Placement } from './types';
import { horizontalRestraintForce, supportingIndexForPlacement } from './restraintPhysics';

describe('horizontalRestraintForce', () => {
  it('pulls displaced cargo back toward its anchor and respects force capacity', () => {
    const force = horizontalRestraintForce(
      100,
      { x: 0.2, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { springAccelerationPerM: 100, dampingPerSecond: 0, maxAccelerationG: 0.3 },
    );
    expect(force.x).toBeLessThan(0);
    expect(force.z).toBe(0);
    expect(force.magnitudeN).toBeCloseTo(100 * 9.81 * 0.3, 5);
  });

  it('damps relative motion even when displacement is zero', () => {
    const force = horizontalRestraintForce(
      50,
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: -0.5 },
      { x: 0, z: 0 },
      { springAccelerationPerM: 5, dampingPerSecond: 2, maxAccelerationG: 1 },
    );
    expect(force.x).toBeLessThan(0);
    expect(force.z).toBeGreaterThan(0);
  });
});

describe('supportingIndexForPlacement', () => {
  const supports: PhysicsSupport[] = [
    { id: 'PALLET-01', x: 0, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25 },
    { id: 'PALLET-02', x: 0, y: 0, z: 0.75, length: 1.1, width: 1.1, height: 0.15, weightKg: 25 },
  ];

  it('selects the highest support below upper-pallet cargo', () => {
    const placement: Placement = { cargoId: 'A', x: 0, y: 0, z: 0.9, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 };
    expect(supportingIndexForPlacement(placement, supports)).toBe(1);
  });

  it('selects the floor pallet for lower-pallet cargo', () => {
    const placement: Placement = { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 };
    expect(supportingIndexForPlacement(placement, supports)).toBe(0);
  });
});
