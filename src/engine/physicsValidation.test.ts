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
});
