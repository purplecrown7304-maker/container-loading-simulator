import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPalletSpec } from './engine/palletOptimization';
import { stagingInputSignature, type PrepareStagingPackagingInput, type StagingPackagingPlan } from './stagingInventory';

const source: PrepareStagingPackagingInput = { scopeKey: 'worker-contract', mode: 'pallets',
  container: { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 }, palletSpec: defaultPalletSpec,
  cargo: [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 2 }] };
type Reply = { requestId: number; plan?: StagingPackagingPlan; error?: string };
let worker: { postMessage: ReturnType<typeof vi.fn<(reply: Reply) => void>>; onmessage: ((event: { data: { requestId: number; input: PrepareStagingPackagingInput } }) => void) | null };
beforeEach(async () => {
  vi.resetModules(); worker = { postMessage: vi.fn(), onmessage: null }; vi.stubGlobal('self', worker);
  await import('./stagingPackaging.worker');
});
afterEach(() => vi.unstubAllGlobals());

describe('staging packaging worker protocol', () => {
  it('returns the matching request ID, provenance and complete real packaging without publishing state', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const input = structuredClone(source); const before = JSON.stringify(input);
    try {
      worker.onmessage!({ data: { requestId: 27, input } });
      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      const reply = worker.postMessage.mock.calls[0][0];
      expect(reply).toMatchObject({ requestId: 27, plan: { inputSignature: stagingInputSignature(source), status: 'ready', scope: 'yard' } });
      expect(reply.error).toBeUndefined();
      expect(reply.plan!.pallets.length).toBeGreaterThan(0);
      expect(reply.plan!.pallets.flatMap(p => p.cargoPlacements)).toHaveLength(2);
      expect(reply.plan!.pallets[0].length).toBe(defaultPalletSpec.length);
      expect(storage).not.toHaveBeenCalled(); expect(JSON.stringify(input)).toBe(before);
    } finally { storage.mockRestore(); }
  });

  it('returns direct-box readiness with no invented pallets', () => {
    const input = { ...source, mode: 'boxes' as const };
    worker.onmessage!({ data: { requestId: 28, input } });
    expect(worker.postMessage).toHaveBeenCalledWith({ requestId: 28,
      plan: { inputSignature: stagingInputSignature(input), status: 'ready', pallets: [], remaining: [] } });
  });

  it('returns failures under the same request ID without a partial plan', () => {
    const invalid = { ...source, cargo: null } as unknown as PrepareStagingPackagingInput;
    worker.onmessage!({ data: { requestId: 29, input: invalid } });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const reply = worker.postMessage.mock.calls[0][0];
    expect(reply.requestId).toBe(29); expect(reply.error).toEqual(expect.any(String));
    expect(reply.error!.length).toBeGreaterThan(0); expect(reply).not.toHaveProperty('plan');
  });
});
