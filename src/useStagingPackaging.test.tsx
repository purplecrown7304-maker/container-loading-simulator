import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareStagingPackaging, stagingInputSignature, type PrepareStagingPackagingInput, type StagingPackagingPlan } from './stagingInventory';
import { useStagingPackaging } from './useStagingPackaging';

vi.mock('./stagingInventory', async importOriginal => {
  const actual = await importOriginal<typeof import('./stagingInventory')>();
  return { ...actual, prepareStagingPackaging: vi.fn(actual.prepareStagingPackaging) };
});
const input: PrepareStagingPackagingInput = { scopeKey: 'worker-shipment', mode: 'boxes',
  container: { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 },
  cargo: [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 2 }] };
const plan = (source = input): StagingPackagingPlan => ({ inputSignature: stagingInputSignature(source), status: 'ready', pallets: [], remaining: [] });
type WorkerReply = { requestId: number; plan?: StagingPackagingPlan; error?: string };
class PackagingWorker {
  static instances: PackagingWorker[] = [];
  static constructorError = false;
  static postError = false;
  onmessage: ((event: { data: WorkerReply }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: URL, public options: WorkerOptions) {
    if (PackagingWorker.constructorError) throw new Error('Worker unavailable');
    PackagingWorker.instances.push(this);
  }
  postMessage = vi.fn((_: { requestId: number; input: PrepareStagingPackagingInput }) => {
    if (PackagingWorker.postError) throw new Error('Cannot clone input');
  });
  terminate = vi.fn();
  get requestId() { return this.postMessage.mock.calls[0][0].requestId; }
  reply(data: Partial<WorkerReply> = {}) { this.onmessage?.({ data: { requestId: this.requestId, ...data } }); }
}
let root: Root | undefined;
let host: HTMLDivElement;
let latest: ReturnType<typeof useStagingPackaging>;
let renders = 0;
function Harness({ source, enabled }: { source: PrepareStagingPackagingInput; enabled: boolean }) {
  latest = useStagingPackaging(source, enabled); renders++;
  return <output>{latest.busy ? 'working' : latest.error || latest.plan?.status || 'idle'}</output>;
}
async function render(source = input, enabled = true) { await act(async () => root!.render(<Harness source={source} enabled={enabled} />)); }
const worker = () => PackagingWorker.instances.at(-1)!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', PackagingWorker);
  PackagingWorker.instances = []; PackagingWorker.constructorError = false; PackagingWorker.postError = false;
  vi.mocked(prepareStagingPackaging).mockReset().mockImplementation(source => plan(source));
  renders = 0; host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('staging packaging worker lifecycle', () => {
  it('packages only when enabled and publishes only the matching completed plan', async () => {
    await render(input, false); expect(PackagingWorker.instances).toHaveLength(0); expect(latest.busy).toBe(false);
    await render(); expect(latest.busy).toBe(true); expect(latest.plan).toBeUndefined();
    expect(worker().options).toEqual({ type: 'module' });
    expect(worker().postMessage).toHaveBeenCalledWith({ requestId: worker().requestId, input });
    const completed = plan(); await act(async () => worker().reply({ plan: completed }));
    expect(latest).toMatchObject({ plan: completed, busy: false, error: '' });
    expect(worker().terminate).toHaveBeenCalled(); expect(prepareStagingPackaging).not.toHaveBeenCalled();
  });

  it('terminates the old request and ignores late results or errors after a changed shipment', async () => {
    await render(); const old = worker();
    const changed = { ...input, cargo: [{ ...input.cargo[0], quantity: 3 }] }; await render(changed); const current = worker();
    expect(old.terminate).toHaveBeenCalled(); expect(current).not.toBe(old);
    await act(async () => { old.reply({ plan: plan() }); old.onerror?.(); });
    expect(latest).toMatchObject({ busy: true, error: '' }); expect(latest.plan).toBeUndefined();
    await act(async () => current.reply({ plan: plan(changed) }));
    expect(latest.plan?.inputSignature).toBe(stagingInputSignature(changed)); expect(latest.busy).toBe(false);
    await act(async () => old.reply({ error: 'late error' })); expect(latest.error).toBe('');
  });
  it('hides a completed same-signature plan immediately when vehicle allocation changes', async () => {
    await render(); const first = worker(); await act(async () => first.reply({ plan: plan() })); expect(latest.plan).toBeDefined();
    const changed: PrepareStagingPackagingInput = { ...input, selectedPlan: { inputSignature: stagingInputSignature(input),
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] } } };
    await render(changed); expect(latest.plan).toBeUndefined(); expect(latest.busy).toBe(true);
    await act(async () => first.reply({ plan: plan() })); expect(latest.plan).toBeUndefined();
    const completed = { ...plan(changed), scope: 'yard' as const, reservedCounts: { A: 0 } };
    await act(async () => worker().reply({ plan: completed })); expect(latest.plan).toBe(completed); expect(latest.busy).toBe(false);
  });

  it('cancels when disabled, clears old plans and never accepts a disabled response', async () => {
    await render(); const old = worker(); await act(async () => old.reply({ plan: plan() })); expect(latest.plan).toBeDefined();
    await render(input, false); expect(latest).toEqual({ busy: false, error: '', plan: undefined });
    await act(async () => old.reply({ plan: plan() })); expect(latest.plan).toBeUndefined();
    await render(); const current = worker(); await render(input, false);
    expect(current.terminate).toHaveBeenCalled(); await act(async () => current.reply({ plan: plan() }));
    expect(latest.busy).toBe(false); expect(latest.plan).toBeUndefined();
  });

  it('terminates on unmount and ignores queued callbacks without rendering again', async () => {
    await render(); const pending = worker(); await act(async () => root!.unmount()); root = undefined;
    const before = renders; await act(async () => { pending.reply({ plan: plan() }); pending.onerror?.(); });
    expect(pending.terminate).toHaveBeenCalled(); expect(renders).toBe(before);
  });

  it('reports worker computation and runtime errors without publishing a partial plan', async () => {
    await render(); await act(async () => worker().reply({ error: '포장 규격 오류' }));
    expect(latest).toMatchObject({ busy: false, error: '포장 규격 오류' }); expect(latest.plan).toBeUndefined();
    await render({ ...input }); const failed = worker(); await act(async () => failed.onerror?.());
    expect(latest.busy).toBe(false); expect(latest.error).toContain('포장 계획을 계산하지 못했습니다'); expect(latest.plan).toBeUndefined();
    const error = latest.error; await act(async () => failed.reply({ plan: plan() }));
    expect(latest.error).toBe(error); expect(latest.plan).toBeUndefined();
  });

  it('ignores unrelated request IDs without terminating the active worker', async () => {
    await render(); const active = worker();
    await act(async () => active.reply({ requestId: active.requestId - 1, plan: plan() }));
    expect(latest.busy).toBe(true); expect(active.terminate).not.toHaveBeenCalled();
    await act(async () => active.reply({ plan: plan() })); expect(latest.busy).toBe(false); expect(latest.plan).toEqual(plan());
  });

  it('uses the cancellable pure fallback when Worker is absent', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', undefined); await render();
    expect(latest.busy).toBe(true); expect(prepareStagingPackaging).not.toHaveBeenCalled();
    await act(async () => vi.runOnlyPendingTimers()); expect(prepareStagingPackaging).toHaveBeenCalledWith(input);
    expect(latest).toMatchObject({ busy: false, plan: plan(), error: '' });
  });

  it('cancels fallback timers when changed, disabled or unmounted', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', undefined); await render();
    const changed = { ...input, cargo: [{ ...input.cargo[0], quantity: 3 }] }; await render(changed);
    await act(async () => vi.runOnlyPendingTimers()); expect(prepareStagingPackaging).toHaveBeenCalledTimes(1);
    expect(prepareStagingPackaging).toHaveBeenCalledWith(changed); expect(latest.plan).toEqual(plan(changed));
    await render(input); await render(input, false); await act(async () => vi.runOnlyPendingTimers());
    expect(prepareStagingPackaging).toHaveBeenCalledTimes(1);
    await render(input); await act(async () => root!.unmount()); root = undefined;
    await act(async () => vi.runOnlyPendingTimers()); expect(prepareStagingPackaging).toHaveBeenCalledTimes(1);
  });

  it('exposes a pure fallback failure as an error without stale state', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', undefined); vi.mocked(prepareStagingPackaging).mockImplementation(() => { throw new Error('포장 계산 실패'); });
    await render(); await act(async () => vi.runOnlyPendingTimers());
    expect(latest).toMatchObject({ busy: false, error: '포장 계산 실패' }); expect(latest.plan).toBeUndefined();
  });

  it.each(['constructor', 'postMessage'])('falls back safely when Worker %s fails synchronously', async kind => {
    vi.useFakeTimers(); PackagingWorker.constructorError = kind === 'constructor'; PackagingWorker.postError = kind === 'postMessage';
    await render(); await act(async () => vi.runOnlyPendingTimers());
    expect(latest).toMatchObject({ busy: false, plan: plan(), error: '' });
    expect(prepareStagingPackaging).toHaveBeenCalledWith(input);
    if (kind === 'postMessage') expect(worker().terminate).toHaveBeenCalled();
  });
});
