import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDirectResultReoptimizationCandidatesAsync, DIRECT_SEARCH_TIMEOUT_MS } from './finalResultOptimization';
import type { PhysicsTarget } from '../physicsTarget';

const current: PhysicsTarget = {
  mode: 'boxes',
  container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: 0.3, width: 0.3, height: 0.3, quantity: 1, weightKg: 1, maxStackLayers: 6, maxTopLoadKg: 10 }],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.3, width: 0.3, height: 0.3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: 0.027, validationIssues: [] },
};
const alternate = { ...current.result, placements: [{ ...current.result.placements[0], x: 0.3 }] };
let workers: FakeWorker[];
let respond: (worker: FakeWorker, index: number) => void;
class FakeWorker {
  onmessage?: (event: { data: { result: typeof current.result } }) => void;
  request?: { strategy: string };
  terminate = vi.fn();
  constructor() { workers.push(this); }
  postMessage(request: { strategy: string }) { this.request = request; respond(this, workers.length); }
}

beforeEach(() => { workers = []; vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded optional re-layout lifecycle', () => {
  it('preserves the selected operating strategy during safety re-layout', async () => {
    respond = worker => worker.onmessage?.({ data: { result: current.result } });
    await buildDirectResultReoptimizationCandidatesAsync(current, 5, () => false, { strategy: 'unloading' });
    expect(workers.length).toBeGreaterThan(1);
    expect(workers.every(worker => worker.request?.strategy === 'unloading')).toBe(true);
  });
  it('limits actual solver invocations to seven, including rejected/duplicate layouts', async () => {
    respond = worker => worker.onmessage?.({ data: { result: current.result } });
    const progress = vi.fn();
    const result = await buildDirectResultReoptimizationCandidatesAsync(current, 7, () => false, { onProgress: progress });
    expect(workers).toHaveLength(7);
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(result).toEqual({ candidates: [], timedOut: false });
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ completed: 7, total: 7 }));
  });

  it('terminates stalled workers at the deadline and retains only completed candidates', async () => {
    respond = (worker, index) => { if (index === 1) worker.onmessage?.({ data: { result: alternate } }); };
    const pending = buildDirectResultReoptimizationCandidatesAsync(current, 7);
    await vi.advanceTimersByTimeAsync(DIRECT_SEARCH_TIMEOUT_MS);
    const result = await pending;
    expect(result.timedOut).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].result).toEqual(alternate);
    expect(workers).toHaveLength(5);
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the active worker immediately and never returns a stale candidate', async () => {
    respond = () => {};
    const controller = new AbortController();
    const pending = buildDirectResultReoptimizationCandidatesAsync(current, 7, () => false, { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retain quantity loss or invalid geometry after a timeout', async () => {
    respond = (worker, index) => {
      if (index === 1) worker.onmessage?.({ data: { result: { ...alternate, placements: [] } } });
      if (index === 2) worker.onmessage?.({ data: { result: { ...alternate, validationIssues: [{ type: 'COLLISION', message: 'collision', placementIndexes: [0] }] } } });
    };
    const pending = buildDirectResultReoptimizationCandidatesAsync(current, 7);
    await vi.advanceTimersByTimeAsync(DIRECT_SEARCH_TIMEOUT_MS);
    expect(await pending).toEqual({ candidates: [], timedOut: true });
  });
});
