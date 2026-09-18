import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadContainerAsync } from './asyncLoading';
import { loadContainer, restoreLoadingResult } from './loadingEngine';
import { clearManualOverride, writeManualOverride } from './manualOverride';

const container = { length: 1, width: 1, height: 1, maxPayloadKg: 100 };
const cargo = [{ id: 'ASYNC', name: '박스', length: 0.5, width: 0.5, height: 0.2, quantity: 12, weightKg: 1, maxStackLayers: 3, maxTopLoadKg: 2 }];

afterEach(() => { vi.unstubAllGlobals(); clearManualOverride(); });

describe('asynchronous loading lifecycle', () => {
  it('keeps an explicitly applied final layout on a storage notification and clears it when inputs change', () => {
    const final = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    writeManualOverride(container, cargo, final);
    expect(restoreLoadingResult(container, cargo)).toEqual(final);
    const pending = restoreLoadingResult(container, [{ ...cargo[0], maxStackLayers: 1 }]);
    expect(pending.placements).toEqual([]);
    expect(pending.remaining).toEqual([]);
  });

  it('preserves deterministic packing and safety in the non-browser fallback', async () => {
    vi.stubGlobal('Worker', undefined);
    expect(await loadContainerAsync(container, cargo, 'capacity')).toEqual(loadContainer(container, cargo, { strategy: 'capacity', publish: false }));
  });

  it('terminates a cancelled worker instead of accepting a stale layout', async () => {
    let worker: { terminate: ReturnType<typeof vi.fn> };
    vi.stubGlobal('Worker', class {
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { worker = this; }
    });
    const controller = new AbortController();
    const result = loadContainerAsync(container, cargo, 'capacity', controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(worker!.terminate).toHaveBeenCalledOnce();
  });

  it('reports a worker failure instead of returning an empty success', async () => {
    vi.stubGlobal('Worker', class {
      onerror?: () => void;
      terminate = vi.fn();
      postMessage() { queueMicrotask(() => this.onerror?.()); }
    });
    await expect(loadContainerAsync(container, cargo, 'capacity')).rejects.toThrow('적재 계산 모듈');
  });
});
