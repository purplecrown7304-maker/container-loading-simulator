import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

/** Run the identical deterministic solver away from the UI thread. */
export function loadContainerAsync(container: ContainerSpec, cargo: CargoItem[], strategy: LoadingStrategy, signal?: AbortSignal): Promise<LoadingResult> {
  if (signal?.aborted) return Promise.reject(new DOMException('취소됨', 'AbortError'));
  // Node/unit tests have no browser Worker. Production browsers use the worker below.
  if (typeof Worker === 'undefined') return Promise.resolve(loadContainer(container, cargo, { strategy, publish: false }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./loading.worker.ts', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(new DOMException('취소됨', 'AbortError')); };
    worker.onmessage = (event: MessageEvent<{ result?: LoadingResult; error?: string }>) => {
      clean();
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? '적재 계산 결과를 읽지 못했습니다.'));
    };
    worker.onerror = () => { clean(); reject(new Error('적재 계산 모듈을 실행하지 못했습니다. 다시 시도해 주세요.')); };
    worker.onmessageerror = () => { clean(); reject(new Error('적재 계산 결과를 읽지 못했습니다.')); };
    signal?.addEventListener('abort', abort, { once: true });
    try { worker.postMessage({ container, cargo, strategy }); }
    catch (error) { clean(); reject(error); }
  });
}
