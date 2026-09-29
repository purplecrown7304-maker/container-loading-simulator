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

describe('banded pallet unit load', () => {
  const bigContainer: ContainerSpec = { length: 3, width: 2.4, height: 2.4, maxPayloadKg: 28000 };
  // Light export pallet under a ~1 t load: the carton/pallet mass ratio that used to make the
  // per-carton solver throw cartons around even before any inertial force was applied.
  const pallet: PhysicsSupport = { id: 'PALLET-01', x: 0.5, y: 0.5, z: 0, length: 1.1, width: 1.1, height: 0.12, weightKg: 6, dynamic: true };
  const cartons: Placement[] = [];
  for (let layer = 0; layer < 2; layer += 1) {
    for (let ix = 0; ix < 4; ix += 1) {
      for (let iy = 0; iy < 8; iy += 1) {
        cartons.push({ cargoId: 'BOX', x: 0.58 + ix * 0.235, y: 0.53 + iy * 0.13, z: 0.12 + layer * 0.265, length: 0.235, width: 0.13, height: 0.265, weightKg: 16 });
      }
    }
  }
  const strapped = (capacityG: number) => ({
    frictionCoefficient: 0.82,
    cargoRestraint: { springAccelerationPerM: 33, dampingPerSecond: 7.7, maxAccelerationG: capacityG },
  });

  it('moves a strapped + wrapped pallet as one unit when strap capacity covers the scenario', async () => {
    const result = await runInertiaAnimation(bigContainer, cartons, 'braking', [pallet], undefined, strapped(0.58), { captureFrames: false });
    expect(result.restraintMode).toBe('unit-load');
    expect(result.scenarioDemandG).toBeCloseTo(0.5);
    expect(result.maxCargoRelativeSlipM ?? Infinity).toBeLessThan(0.008);
    expect(result.maxHorizontalShiftM).toBeLessThan(0.012);
    expect(result.maxTiltDeg).toBeLessThan(1.8);
    // Straps carry each carton's full inertial load (16 kg × 0.5 g), with no friction credit.
    expect(result.maxCargoRestraintForceN).toBeCloseTo(16 * 9.81 * 0.5, 0);
  }, 30_000);

  it('falls back to per-carton simulation when strap capacity is below the scenario demand', async () => {
    const result = await runInertiaAnimation(bigContainer, cartons, 'braking', [pallet], undefined, strapped(0.36), { captureFrames: false });
    expect(result.restraintMode).toBe('per-carton');
    expect(result.cargoRestraintCapacityG).toBeCloseTo(0.36);
  }, 30_000);

  it('keeps carton frames attached to the moving pallet for playback', async () => {
    const result = await runInertiaAnimation(bigContainer, cartons.slice(0, 4), 'acceleration', [pallet], undefined, strapped(0.58));
    const last = result.frames[result.frames.length - 1];
    const first = result.frames[0];
    const palletDx = last.supports[0] - first.supports[0];
    const cartonDx = last.cargo[0] - first.cargo[0];
    expect(Math.abs(cartonDx - palletDx)).toBeLessThan(0.002);
  }, 30_000);
});
