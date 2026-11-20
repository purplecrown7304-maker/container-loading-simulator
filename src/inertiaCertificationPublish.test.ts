import { afterEach, expect, it, vi } from 'vitest';
import { directLoadingFixtures } from '../e2e/helpers/loadingFixtures';
import { loadContainer } from './engine/loadingEngine';
import { INERTIA_CERTIFICATION_EVENT, clearLatestInertiaCertification, readLatestInertiaCertification, runInertiaCertification } from './inertiaCertification';
import { resetPhysicsWorkerPool } from './physicsWorkerPool';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { cargoFromProductPackaging } from './productWorkflow';
import { CONTAINER_EQUIPMENT } from './transportEquipment';

afterEach(() => { resetPhysicsWorkerPool(); clearPhysicsTarget(); clearLatestInertiaCertification(); });

// The automatic final-loading comparison certifies the plan on screen and its alternatives and
// publishes the verdict of the one it selects. The real certification, on a live target:
it('certifies a live target without publishing when the caller publishes the verdict itself', async () => {
  const container = { ...CONTAINER_EQUIPMENT.find(item => item.id === '40-high-cube')! };
  const cargo = cargoFromProductPackaging([{ id: 'LIVE', name: 'LIVE', ...directLoadingFixtures.threeBox40ft, requiresBoxPackaging: false }], []);
  const target: PhysicsTarget = { mode: 'boxes', container, cargo, result: loadContainer(container, cargo, { strategy: 'stability', publish: false }) };
  publishPhysicsTarget(target);
  clearLatestInertiaCertification();
  const published = vi.fn();
  window.addEventListener(INERTIA_CERTIFICATION_EVENT, published);
  try {
    const silent = await runInertiaCertification(target, undefined, undefined, undefined, { publish: false });
    expect(silent.status).toBe('passed');
    expect(silent.testedScenarios).toBe(3);
    expect(published).not.toHaveBeenCalled();
    expect(readLatestInertiaCertification()).toBeUndefined();

    // The default is unchanged: a certification of the live target is the live verdict.
    const loud = await runInertiaCertification(target);
    expect(published).toHaveBeenCalledOnce();
    expect(readLatestInertiaCertification()).toBe(loud);
    // The option changes who announces the verdict, never the verdict.
    const verdict = (c: typeof loud) => [c.status, c.targetSignature, c.securing.level, c.failedScenarios, c.maxHorizontalShiftM, c.maxTiltDeg, c.payloadWithinLimit];
    expect(verdict(silent)).toEqual(verdict(loud));
  } finally {
    window.removeEventListener(INERTIA_CERTIFICATION_EVENT, published);
  }
}, 120_000);
