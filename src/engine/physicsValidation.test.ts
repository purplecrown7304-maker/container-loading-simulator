import { describe, expect, it } from 'vitest';
import { runPhysicsValidation, runPhysicsValidationSuite } from './physicsValidation';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
const box = (z: number, x = 0, y = 0): Placement => ({
  cargoId: 'BOX-A', x, y, z,
  length: 1, width: 1, height: 0.4, weightKg: 20,
});

describe('Rapier physics validation', () => {
  it('keeps a floor-supported box stable', async () => {
    const result = await runPhysicsValidation(container, [box(0)]);
    expect(result.engine).toBe('Rapier 3D');
    expect(result.scenario).toBe('settle');
    expect(result.simulatedCount).toBe(1);
    expect(result.unstableCount).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.maxHorizontalShiftM).toBeLessThan(0.012);
    expect(result.maxVerticalShiftM).toBeLessThan(0.015);
  }, 20_000);

  it('detects an unsupported floating box falling under gravity', async () => {
    const result = await runPhysicsValidation(container, [box(0.8)]);
    expect(result.unstableCount).toBe(1);
    expect(result.placements[0].verticalShiftM).toBeLessThan(-0.5);
    expect(result.placements[0].reason).toContain('높이 변화');
  }, 20_000);

  it('runs gravity, braking and cornering as one transport suite', async () => {
    const result = await runPhysicsValidationSuite(container, [box(0)]);
    expect(result.scenarios.map(row => row.scenario)).toEqual(['settle', 'braking', 'cornering']);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.unstableCount).toBe(0);
  }, 30_000);

  it('uses a pallet rigid body as physical support for palletized cargo', async () => {
    const palletHeight = 0.15;
    const result = await runPhysicsValidationSuite(
      container,
      [box(palletHeight)],
      undefined,
      [{ id: 'PALLET-01', x: 0, y: 0, z: 0, length: 1, width: 1, height: palletHeight, weightKg: 25, dynamic: true }],
    );
    expect(result.supports).toHaveLength(1);
    expect(result.supportUnstableCount).toBe(0);
    expect(result.unstableCount).toBe(0);
    expect(result.scenarios.every(row => row.supportCount === 1)).toBe(true);
  }, 30_000);
});
