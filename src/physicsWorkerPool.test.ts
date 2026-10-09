import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import { runPhysicsScenarioJob, type PhysicsScenarioJob } from './engine/physicsScenarioJob';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import type { ContainerSpec, Placement } from './engine/types';
import { buildInertiaSimulationSupports, buildSecuringUsage, runInertiaCertification, securingProfileForUsage } from './inertiaCertification';
import { clearInertiaScenarioRuns, createInertiaRunSession, inertiaTargetKey } from './inertiaScenarioRuns';
import { completeCertificationForWorkOrder } from './inertiaWorkOrderPolicy';
import { runPhysicsValidationSuiteParallel } from './physicsParallel';
import type { PhysicsTarget } from './physicsTarget';
import { physicsWorkerCount, runPhysicsScenarioPooled, setPhysicsWorkerFactoryForTests } from './physicsWorkerPool';

/** In-process stand-in for the browser worker: structured-clone in, real Rapier, clone out. */
const stats = { created: 0, running: 0, peak: 0, terminated: 0 };
function fakeWorker() {
  stats.created += 1;
  let alive = true;
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    terminate: () => { alive = false; stats.terminated += 1; },
    postMessage: (message: unknown) => {
      const { id, job } = structuredClone(message) as { id: number; job: PhysicsScenarioJob };
      stats.running += 1;
      stats.peak = Math.max(stats.peak, stats.running);
      const send = (data: unknown) => { if (alive) worker.onmessage?.({ data: structuredClone(data) } as MessageEvent); };
      setTimeout(() => {
        runPhysicsScenarioJob(job, progress => send({ id, progress }), () => !alive)
          .then(result => { stats.running -= 1; send({ id, result }); }, error => { stats.running -= 1; send({ id, error: String(error) }); });
      }, 0);
    },
  };
  return worker;
}

const container: ContainerSpec = { length: 4, width: 2.35, height: 2.4, maxPayloadKg: 5000 };
function stackedPlacements(): Placement[] {
  const placements: Placement[] = [];
  for (let x = 0; x < 4; x += 1) for (let z = 0; z < 3; z += 1) {
    placements.push({ cargoId: 'BOX', x: x * 0.6, y: 0.2, z: z * 0.5, length: 0.6, width: 0.8, height: 0.5, weightKg: 40 + z * 5 });
  }
  return placements;
}
function target(): PhysicsTarget {
  const placements = stackedPlacements();
  return { mode: 'boxes', container, cargo: [{ id: 'BOX', name: 'BOX', length: 0.6, width: 0.8, height: 0.5, weightKg: 40, quantity: 12 }],
    result: { placements, remaining: [], loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0), usedVolumeM3: 2.88, validationIssues: [] } };
}

beforeEach(() => {
  Object.assign(stats, { created: 0, running: 0, peak: 0, terminated: 0 });
  clearInertiaScenarioRuns();
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
  setPhysicsWorkerFactoryForTests(fakeWorker);
});
afterEach(() => {
  setPhysicsWorkerFactoryForTests(undefined);
  vi.unstubAllGlobals();
});

describe('physics worker pool', () => {
  it('gives the suite the exact result of the sequential run, with at most cores-1 workers', async () => {
    expect(physicsWorkerCount()).toBe(3);
    const placements = stackedPlacements();
    const sequential = await runPhysicsValidationSuite(container, placements);
    const progress: number[] = [];
    const parallel = await runPhysicsValidationSuiteParallel(container, placements, value => progress.push(value));
    expect(parallel).toEqual(sequential);
    expect(stats.peak).toBeGreaterThan(1);
    expect(stats.peak).toBeLessThanOrEqual(3);
    expect(progress.at(-1)).toBe(1);
  }, 60_000);

  it('returns the direct inertia result for one pooled scenario', async () => {
    const current = target();
    const usage = buildSecuringUsage(current, 2);
    const supports = buildInertiaSimulationSupports(current, usage);
    const securing = securingProfileForUsage('boxes', usage);
    const direct = await runInertiaAnimation(container, current.result.placements, 'braking', supports, undefined, securing, { captureFrames: false });
    const pooled = await runPhysicsScenarioPooled({ kind: 'inertia', container, placements: current.result.placements, scenario: 'braking', supports, securing });
    expect(pooled).toEqual(direct);
  }, 60_000);

  it('removes a cancelled queued job and terminates a cancelled running job', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    const placements = stackedPlacements();
    const job = (scenario: 'braking' | 'cornering') => ({ kind: 'physics' as const, container, placements, scenario, supports: [] });
    const running = new AbortController(), queued = new AbortController();
    const first = runPhysicsScenarioPooled(job('braking'), undefined, running.signal);
    const second = runPhysicsScenarioPooled(job('cornering'), undefined, queued.signal);
    queued.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    running.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(stats.terminated).toBe(1);
    // The pool keeps working after a cancellation.
    await expect(runPhysicsScenarioPooled(job('cornering'))).resolves.toMatchObject({ scenario: 'cornering' });
  }, 60_000);

  it('runs the current-thread fallback one scenario at a time', async () => {
    setPhysicsWorkerFactoryForTests(null);
    const placements = stackedPlacements();
    const order: string[] = [];
    const job = (scenario: 'settle' | 'braking') => ({ kind: 'physics' as const, container, placements, scenario, supports: [] });
    const track = (name: string) => (value: number) => { if (value === 0 || value === 1) order.push(`${name}:${value}`); };
    await Promise.all([runPhysicsScenarioPooled(job('settle'), track('a')), runPhysicsScenarioPooled(job('braking'), track('b'))]);
    // The second scenario starts only after the first has finished.
    expect(order.indexOf('b:0')).toBeGreaterThan(order.lastIndexOf('a:1'));
    expect(order.indexOf('a:0')).toBe(0);
  }, 60_000);

  it('falls back to the current thread when a worker cannot even be constructed', async () => {
    setPhysicsWorkerFactoryForTests(() => { throw new Error('blocked by policy'); });
    const placements = stackedPlacements();
    const job = { kind: 'physics' as const, container, placements, scenario: 'acceleration' as const, supports: [] };
    await expect(runPhysicsScenarioPooled(job)).resolves.toEqual(await runPhysicsScenarioJob(job));
  }, 60_000);

  it('falls back to the current thread when the worker script cannot start', async () => {
    setPhysicsWorkerFactoryForTests(() => {
      const broken = fakeWorker();
      broken.postMessage = () => { setTimeout(() => broken.onerror?.(new Event('error')), 0); };
      return broken;
    });
    const placements = stackedPlacements();
    const job = { kind: 'physics' as const, container, placements, scenario: 'settle' as const, supports: [] };
    await expect(runPhysicsScenarioPooled(job)).resolves.toEqual(await runPhysicsScenarioJob(job));
  }, 60_000);
});

describe('shared inertia runs', () => {
  it('reuses a run for identical inputs and starts a new one when any input differs', async () => {
    const current = target();
    const usage = buildSecuringUsage(current, 1);
    const inputs = { container, placements: current.result.placements, scenario: 'acceleration' as const,
      supports: buildInertiaSimulationSupports(current, usage), securing: securingProfileForUsage('boxes', usage) };
    const key = inertiaTargetKey(container, current.result.placements);
    const session = createInertiaRunSession();
    const a = await session.start(key, inputs).wait();
    const b = await session.start(key, { ...inputs }).wait();
    expect(b).toBe(a);
    expect(stats.created).toBe(1);
    const other = await session.start(key, { ...inputs, securing: securingProfileForUsage('boxes', buildSecuringUsage(current, 3)) }).wait();
    expect(other).not.toBe(a);
    session.release();
  }, 60_000);

  it('aborts runs nobody holds when a session is released, but keeps runs marked for completion', async () => {
    const current = target();
    const key = inertiaTargetKey(container, current.result.placements);
    const inputs = (scenario: 'braking' | 'cornering') => ({ container, placements: current.result.placements, scenario, supports: [] });
    const session = createInertiaRunSession();
    const dropped = session.start(key, inputs('braking'));
    const kept = session.start(key, inputs('cornering'));
    kept.keep();
    const droppedResult = dropped.wait().then(() => 'done', error => error.name);
    session.release();
    expect(await droppedResult).toBe('AbortError');
    const later = createInertiaRunSession();
    await expect(later.start(key, inputs('cornering')).wait()).resolves.toMatchObject({ scenario: 'cornering' });
    later.release();
  }, 60_000);

  it('stops a kept run once another target starts, so it cannot hold a worker', async () => {
    const first = target();
    const second = target();
    second.result.placements = second.result.placements.map(p => ({ ...p, y: 0.3 }));
    const session = createInertiaRunSession();
    const kept = session.start(inertiaTargetKey(container, first.result.placements), { container, placements: first.result.placements, scenario: 'cornering', supports: [] });
    kept.keep();
    const outcome = kept.wait().then(() => 'done', error => error.name);
    session.release();
    const other = createInertiaRunSession();
    await other.start(inertiaTargetKey(container, second.result.placements), { container, placements: second.result.placements, scenario: 'cornering', supports: [] }).wait();
    other.release();
    expect(await outcome).toBe('AbortError');
  }, 60_000);

  it('certifies and completes with pooled runs exactly like a run without shared results', async () => {
    const current = target();
    const pooled = await completeCertificationForWorkOrder(current, await runInertiaCertification(current));
    clearInertiaScenarioRuns();
    setPhysicsWorkerFactoryForTests(null);
    const inThread = await completeCertificationForWorkOrder(current, await runInertiaCertification(current));
    const strip = (value: typeof pooled) => ({ ...value, testedAt: '' });
    expect(strip(pooled)).toEqual(strip(inThread));
  }, 120_000);
});
