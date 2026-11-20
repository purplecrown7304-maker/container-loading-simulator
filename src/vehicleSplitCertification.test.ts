import { afterEach, describe, expect, it } from 'vitest';
import { directLoadingFixtures } from '../e2e/helpers/loadingFixtures';
import { loadContainer } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec } from './engine/types';
import { cargoUnitCount, splitCargoEvenly } from './engine/vehicleSplit';
import { INERTIA_PASS_SHIFT_M, INERTIA_PASS_TILT_DEG, runInertiaCertification } from './inertiaCertification';
import { isPhysicsTargetVerified, physicsTargetHardFailureReasons } from './inertiaWorkOrderPolicy';
import { resetPhysicsWorkerPool } from './physicsWorkerPool';
import type { PhysicsTarget } from './physicsTarget';
import { cargoFromProductPackaging } from './productWorkflow';
import { reportedTwentyFoot, reportedTwentyFootCargo } from './testFixtures/reportedTwentyFootShipment';
import { CONTAINER_EQUIPMENT } from './transportEquipment';

/**
 * A vehicle of a divided job (AGENTS.md 2L) is an ordinary job: it is planned by the unchanged
 * planner and has to pass the unchanged certification by itself. These tests run the real
 * certification, with the limits read from the certification module.
 */
function vehicleTarget(container: ContainerSpec, cargo: CargoItem[]): PhysicsTarget {
  return { mode: 'boxes', container, cargo, result: loadContainer(container, cargo, { strategy: 'stability', publish: false }) };
}

describe('vehicles of a divided job under the unchanged certification', () => {
  afterEach(() => resetPhysicsWorkerPool());

  it('both halves of the reported 20 ft shipment load completely and pass, at the first securing level', async () => {
    const shares = splitCargoEvenly(reportedTwentyFootCargo, 2);
    expect(shares.map(cargoUnitCount)).toEqual([1453, 1454]);
    for (const share of shares) {
      const target = vehicleTarget(reportedTwentyFoot, share);
      expect(target.result.remaining).toEqual([]);
      expect(target.result.placements).toHaveLength(cargoUnitCount(share));
      expect(physicsTargetHardFailureReasons(target)).toEqual([]);
      const certification = await runInertiaCertification(target);
      expect(certification.status).toBe('passed');
      expect(certification.securing.level).toBe(1);
      expect(certification.failedScenarios).toEqual([]);
      expect(certification.testedScenarios).toBe(3);
      // The whole shipment in one container measures 24.8 mm under braking and fails.
      expect(certification.maxHorizontalShiftM).toBeLessThan(INERTIA_PASS_SHIFT_M);
      expect(certification.maxTiltDeg).toBeLessThan(INERTIA_PASS_TILT_DEG);
      expect(isPhysicsTargetVerified(target, certification)).toBe(true);
    }
  }, 300_000);

  it.each([
    ['overflowTwentyOneBox40ft', 9, [11, 10]],
    ['overflowTwentyBox40ft', 8, [10, 10]],
  ] as const)('browser fixture %s leaves %i waiting in one vehicle and passes as two', async (key, waiting, units) => {
    const container = { ...CONTAINER_EQUIPMENT.find(item => item.id === '40-high-cube')! };
    const cargo = cargoFromProductPackaging([{ id: key, name: key, ...directLoadingFixtures[key], requiresBoxPackaging: false }], []);
    const single = vehicleTarget(container, cargo);
    expect(single.result.placements).toHaveLength(12);
    expect(single.result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(waiting);

    const shares = splitCargoEvenly(cargo, 2);
    expect(shares.map(cargoUnitCount)).toEqual(units);
    for (const share of shares) {
      const target = vehicleTarget(container, share);
      expect(target.result.remaining).toEqual([]);
      expect(physicsTargetHardFailureReasons(target)).toEqual([]);
      expect(isPhysicsTargetVerified(target, await runInertiaCertification(target))).toBe(true);
    }
  }, 120_000);
});
