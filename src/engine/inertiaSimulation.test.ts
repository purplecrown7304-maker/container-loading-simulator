import { describe, expect, it } from 'vitest';
import type { PhysicsSupport } from './physicsValidation';
import { runInertiaAnimation } from './inertiaSimulation';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };

const floatingBox: Placement = {
  cargoId: 'BOX-A',
  x: 0.5,
  y: 0.5,
  z: 0.9,
  length: 0.5,
  width: 0.5,
  height: 0.4,
  weightKg: 20,
};

describe('inertia animation frames', () => {
  it('records actual Rapier motion frames for visual playback', async () => {
    const result = await runInertiaAnimation(container, [floatingBox], 'acceleration');
    expect(result.frames.length).toBeGreaterThan(20);
    expect(result.cargoCount).toBe(1);
    expect(result.scenario).toBe('acceleration');
    const firstY = result.frames[0].cargo[1];
    const lastY = result.frames[result.frames.length - 1].cargo[1];
    expect(lastY).toBeLessThan(firstY - 0.5);
    expect(result.frames.some(frame => frame.phase === 'force')).toBe(true);
    expect(result.frames.some(frame => frame.phase === 'coast')).toBe(true);
  }, 20_000);

  it('can calculate certification metrics without retaining transform frames', async () => {
    const result = await runInertiaAnimation(
      container,
      [floatingBox],
      'cornering',
      [],
      undefined,
      undefined,
      { captureFrames: false },
    );
    expect(result.frames).toEqual([]);
    expect(result.fps).toBe(0);
    expect(result.cargoCount).toBe(1);
    expect(result.maxHorizontalShiftM).toBeGreaterThanOrEqual(0);
    expect(result.maxTiltDeg).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('stops a stale simulation when the caller cancels it', async () => {
    await expect(runInertiaAnimation(
      container,
      [floatingBox],
      'braking',
      [],
      undefined,
      undefined,
      { captureFrames: false, shouldCancel: () => true },
    )).rejects.toThrow('INERTIA_SIMULATION_CANCELLED');
  }, 20_000);

  it('applies pallet-relative restraint forces during braking', async () => {
    const pallet: PhysicsSupport = {
      id: 'PALLET-01',
      x: 0.45,
      y: 0.45,
      z: 0,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      weightKg: 25,
      dynamic: true,
    };
    const palletBox: Placement = {
      cargoId: 'BOX-P',
      x: 0.75,
      y: 0.75,
      z: 0.15,
      length: 0.5,
      width: 0.5,
      height: 0.5,
      weightKg: 40,
    };

    const baseline = await runInertiaAnimation(container, [palletBox], 'braking', [pallet]);
    const reinforced = await runInertiaAnimation(container, [palletBox], 'braking', [pallet], undefined, {
      frictionCoefficient: 0.84,
      cargoRetentionRatio: 0.58,
      supportRetentionRatio: 0.30,
    });

    expect(reinforced.maxCargoRelativeSlipM).toBeTypeOf('number');
    expect(reinforced.maxSupportShiftM).toBeTypeOf('number');
    expect(reinforced.maxCargoRestraintForceN).toBeGreaterThan(0);
    expect(reinforced.maxSupportRestraintForceN).toBeGreaterThan(0);
    expect(reinforced.maxCargoRelativeSlipM ?? Infinity).toBeLessThanOrEqual((baseline.maxCargoRelativeSlipM ?? Infinity) + 1e-6);
  }, 30_000);
});
