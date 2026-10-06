import { describe, expect, it } from 'vitest';
import { directLoadingFixtures } from '../e2e/helpers/loadingFixtures';
import { loadContainer, type LoadingStrategy } from './engine/loadingEngine';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import { runInertiaCertification } from './inertiaCertification';
import { completeCertificationForWorkOrder, isInertiaCertificationComplete, isPhysicsTargetVerified, physicsTargetHardFailureReasons, assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { cargoFromProductPackaging } from './productWorkflow';
import { CONTAINER_EQUIPMENT } from './transportEquipment';
import type { PhysicsTarget } from './physicsTarget';

function target(key: keyof typeof directLoadingFixtures, equipmentId: string, strategy: LoadingStrategy = 'capacity'): PhysicsTarget {
  const container = { ...CONTAINER_EQUIPMENT.find(item => item.id === equipmentId)! };
  const cargo = cargoFromProductPackaging([{ id: key, name: key, ...directLoadingFixtures[key], requiresBoxPackaging: false }], []);
  return { mode: 'boxes', container, cargo, result: loadContainer(container, cargo, { strategy, publish: false }) };
}

describe('real guided workflow browser fixtures', () => {
  it.each([
    ['threeBox40ft', '40-high-cube', 'capacity'],
    ['sixBox20ft', '20-standard', 'capacity'],
    ['twelveBox40ft', '40-high-cube', 'stability'],
  ] as const)('%s satisfies the unchanged static and real inertia gates', async (key, equipment, strategy) => {
    const current = target(key, equipment, strategy);
    expect(current.result.placements).toHaveLength(directLoadingFixtures[key].quantity);
    expect(current.result.remaining).toEqual([]);
    expect(physicsTargetHardFailureReasons(current)).toEqual([]);
    expect(Math.min(...current.result.placements.map(p => p.x))).toBe(0);
    const physics = await runPhysicsValidationSuite(current.container, current.result.placements);
    expect(physics.scenarios.map(scenario => scenario.scenario)).toEqual(['settle', 'acceleration', 'braking', 'cornering']);
    expect(physics.unstableCount).toBe(0);
    const certification = await runInertiaCertification(current);
    expect(isInertiaCertificationComplete(certification)).toBe(true);
    expect(isPhysicsTargetVerified(current, certification)).toBe(true);
  });

  it('accepts the compact light inner-wall load under the approved weight-scaled direct-box CG range', () => {
    const current = target('blockedSmallLoad', '40-high-cube', 'stability');
    expect(current.result.placements).toHaveLength(3);
    expect(current.result.operationalFindings?.filter(f => f.code === 'CG_LONGITUDINAL' && f.severity === 'error')).toEqual([]);
  });

  it('the recovery fixture passes static prerequisites but really fails completed inertia', async () => {
    const current = target('unstableTwoBox20ft', '20-standard');
    expect(current.result.placements).toHaveLength(2);
    expect(physicsTargetHardFailureReasons(current)).toEqual([]);
    const initial = await runInertiaCertification(current);
    const certification = await completeCertificationForWorkOrder(current, initial);
    expect(isInertiaCertificationComplete(certification)).toBe(true);
    expect(certification.status).toBe('failed');
    expect(assessWorkOrderCertification(certification)).toBe('danger');
    expect(isPhysicsTargetVerified(current, certification)).toBe(false);
  });
});
