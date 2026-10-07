import { cgCompliantAlternativeForResult } from '../../../src/engine/cgCompliantPlan';
import { loadContainerAsync } from '../../../src/engine/asyncLoading';
import { loadContainer, type LoadingStrategy } from '../../../src/engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from '../../../src/engine/types';
import type { SecuringMaterialSettings } from '../../../src/securingMaterialSettings';

type Input = { container: ContainerSpec; cargo: CargoItem[]; materials?: SecuringMaterialSettings; strategy?: LoadingStrategy; includeCgAlternative?: boolean };

// This entry is built only by the parity test, never included in the application build.
// It uses the real production modules without App hydration or Rapier certification.
(window as any).runLoadingWorkerParity = async ({ container, cargo, materials, strategy = 'capacity', includeCgAlternative = false }: Input) => {
  const NativeWorker = window.Worker;
  const requests: unknown[] = [];
  const responses: unknown[] = [];
  const errors: string[] = [];
  class TracedWorker extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.addEventListener('message', event => responses.push(structuredClone(event.data)));
      this.addEventListener('error', event => errors.push(event.message));
      this.addEventListener('messageerror', () => errors.push('Worker message could not be cloned'));
    }
    postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
      requests.push(structuredClone(message));
      if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
      else super.postMessage(message, transferOrOptions);
    }
  }
  const timing: Record<string, number> = {};
  let workerResult: LoadingResult;
  let fallbackResult: LoadingResult;
  try {
    window.Worker = TracedWorker;
    const workerStarted = performance.now();
    workerResult = await loadContainerAsync(container, cargo, strategy, undefined, { securingMaterials: materials });
    timing.workerMs = performance.now() - workerStarted;
    // Exercise the exact synchronous fallback in the same browser and JS build.
    Object.defineProperty(window, 'Worker', { configurable: true, writable: true, value: undefined });
    const fallbackStarted = performance.now();
    fallbackResult = await loadContainerAsync(container, cargo, strategy, undefined, { securingMaterials: materials });
    timing.fallbackMs = performance.now() - fallbackStarted;
  } finally {
    window.Worker = NativeWorker;
  }
  const syncStarted = performance.now();
  const syncResult = loadContainer(container, cargo, { strategy, publish: false, securingMaterials: materials });
  timing.syncMs = performance.now() - syncStarted;
  const cgOptions = { strategy, publish: false, securingMaterials: materials };
  const cgAlternatives = includeCgAlternative ? {
    worker: cgCompliantAlternativeForResult(container, cargo, workerResult, cgOptions),
    fallback: cgCompliantAlternativeForResult(container, cargo, fallbackResult, cgOptions),
    sync: cgCompliantAlternativeForResult(container, cargo, syncResult, cgOptions),
  } : undefined;
  return { cgAlternatives, timing, workerResult, fallbackResult, syncResult, requests, responses, errors };
};
