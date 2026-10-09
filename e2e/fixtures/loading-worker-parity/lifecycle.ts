import { loadContainerAsync } from '../../../src/engine/asyncLoading';
import { loadContainer, LOADING_RESULT_EVENT, publishLoadingResult } from '../../../src/engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from '../../../src/engine/types';
import { createLatestInputRun } from '../../../src/latestInputRun';
import type { SecuringMaterialSettings } from '../../../src/securingMaterialSettings';

export type LifecycleScenario = 'determinism' | 'cancellation' | 'stale-result' | 'returned-error' | 'messageerror';
type Input = {
  scenario: LifecycleScenario;
  container: ContainerSpec;
  cargo: CargoItem[];
  materials: SecuringMaterialSettings;
};
type WorkerBehavior = 'normal' | 'hold-response' | 'messageerror';
type Reply = { result?: LoadingResult; error?: string };
type Outcome = { status: 'fulfilled'; result: LoadingResult } | { status: 'rejected'; name: string; message: string };
type WorkerTrace = {
  url: string;
  type?: WorkerType;
  requests: unknown[];
  messages: { trusted: boolean; data: Reply }[];
  errors: string[];
  messageErrors: { trusted: boolean }[];
  terminateCalls: number;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

// Observe the caller's real AbortSignal without replacing browser cancellation.
function trackSignal(controller: AbortController) {
  const signal = controller.signal;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const trace = { added: 0, removed: 0, active: 0 };
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type: string, callback: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
    if (type === 'abort' && callback) {
      trace.added++;
      listeners.add(callback);
      trace.active = listeners.size;
    }
    add(type, callback, options);
  };
  signal.removeEventListener = (type: string, callback: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
    if (type === 'abort' && callback) {
      trace.removed++;
      listeners.delete(callback);
      trace.active = listeners.size;
    }
    remove(type, callback, options);
  };
  return trace;
}

/** Test-only entry: real production Worker, async wrapper, and App ownership helper. */
export async function runLoadingWorkerLifecycle({ scenario, container, cargo, materials }: Input) {
  const NativeWorker = window.Worker;
  if (!NativeWorker) throw new Error('Lifecycle coverage requires a real browser Worker');
  const workers: WorkerTrace[] = [];
  const liveWorkers: Worker[] = [];
  const publications: unknown[] = [];
  const globalErrors: string[] = [];
  const snapshotWindow = window as Window & { __containerLoadingLatestResult?: unknown };
  const previousPublication = snapshotWindow.__containerLoadingLatestResult;
  const onPublication = (event: Event) => publications.push(structuredClone((event as CustomEvent).detail));
  const onGlobalError = (event: ErrorEvent) => globalErrors.push(event.message);
  const onUnhandled = (event: PromiseRejectionEvent) => globalErrors.push(String(event.reason));
  window.addEventListener(LOADING_RESULT_EVENT, onPublication);
  window.addEventListener('error', onGlobalError);
  window.addEventListener('unhandledrejection', onUnhandled);

  let nextBehavior: WorkerBehavior = 'normal';
  const heldResponse = deferred<{ worker: Worker; data: Reply }>();
  class TracedWorker extends NativeWorker {
    private readonly trace: WorkerTrace;
    private readonly behavior: WorkerBehavior;
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.behavior = nextBehavior;
      nextBehavior = 'normal';
      this.trace = { url: String(url), type: options?.type, requests: [], messages: [], errors: [], messageErrors: [], terminateCalls: 0 };
      workers.push(this.trace);
      liveWorkers.push(this);
      this.addEventListener('message', event => {
        this.trace.messages.push({ trusted: event.isTrusted, data: structuredClone(event.data) });
        if (this.behavior === 'hold-response' && event.isTrusted) {
          // Hold a REAL reply before the production onmessage handler sees it.
          // Its later synthetic replay below is explicitly marked untrusted.
          event.stopImmediatePropagation();
          heldResponse.resolve({ worker: this, data: structuredClone(event.data) });
        }
      });
      this.addEventListener('error', event => this.trace.errors.push(event.message));
      this.addEventListener('messageerror', event => this.trace.messageErrors.push({ trusted: event.isTrusted }));
    }
    postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
      this.trace.requests.push(structuredClone(message));
      if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
      else super.postMessage(message, transferOrOptions);
      if (this.behavior === 'messageerror') {
        // Browser deserialization failures cannot be induced reliably with valid
        // structured-clone input. This exercises only the production error handler.
        this.dispatchEvent(new MessageEvent('messageerror'));
      }
    }
    terminate() {
      this.trace.terminateCalls++;
      super.terminate();
    }
  }

  async function within<T>(label: string, promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${scenario}/${label} timed out after 30s: ${JSON.stringify({ workers, globalErrors })}`)), 30_000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  function outcome(promise: Promise<LoadingResult>): Promise<Outcome> {
    return promise.then(
      result => ({ status: 'fulfilled' as const, result }),
      error => ({ status: 'rejected' as const, name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) }),
    );
  }
  const run = (signal?: AbortSignal, items = cargo) => loadContainerAsync(container, items, 'capacity', signal, { securingMaterials: materials });
  const diagnostics = () => ({
    workers: structuredClone(workers),
    publications: structuredClone(publications),
    publicationChanged: snapshotWindow.__containerLoadingLatestResult !== previousPublication,
    globalErrors: [...globalErrors],
  });

  window.Worker = TracedWorker;
  try {
    if (scenario === 'determinism') {
      const results: LoadingResult[] = [];
      const signals = [];
      for (let index = 0; index < 3; index++) {
        const controller = new AbortController();
        const signalTrace = trackSignal(controller);
        results.push(await within(`repeat-${index + 1}`, run(controller.signal)));
        // Cleanup must remove abort listeners even after successful completion.
        controller.abort();
        signals.push(signalTrace);
      }
      const synchronous = loadContainer(container, cargo, { strategy: 'capacity', publish: false, securingMaterials: materials });
      return { scenario, results, synchronous, signals, ...diagnostics() };
    }

    if (scenario === 'cancellation') {
      const preAborted = new AbortController();
      const preAbortedSignal = trackSignal(preAborted);
      preAborted.abort();
      const beforeConstruction = workers.length;
      const preAbortedOutcome = await within('pre-aborted', outcome(run(preAborted.signal)));
      const preAbortedWorkers = workers.length - beforeConstruction;

      const active = new AbortController();
      const activeSignal = trackSignal(active);
      let activeFulfilled = 0;
      const pending = run(active.signal).then(result => { activeFulfilled++; return result; });
      const activeOutcomePromise = outcome(pending);
      active.abort();
      const activeOutcome = await within('post-dispatch-abort', activeOutcomePromise);

      const queued = new AbortController();
      const queuedSignal = trackSignal(queued);
      nextBehavior = 'hold-response';
      let queuedFulfilled = 0;
      const queuedOutcomePromise = outcome(run(queued.signal).then(result => { queuedFulfilled++; return result; }));
      const held = await within('hold-real-response', heldResponse.promise);
      queued.abort();
      const queuedOutcome = await within('queued-response-abort', queuedOutcomePromise);
      // A deliberately late callback cannot change an already rejected promise.
      held.worker.dispatchEvent(new MessageEvent('message', { data: structuredClone(held.data) }));
      await Promise.resolve();
      return {
        scenario, preAbortedOutcome, preAbortedWorkers, preAbortedSignal,
        activeOutcome, activeFulfilled, activeSignal,
        queuedOutcome, queuedFulfilled, queuedSignal,
        replayedRealResult: Boolean(held.data.result), ...diagnostics(),
      };
    }

    if (scenario === 'stale-result') {
      // Exercise App's actual request ownership helper with real Worker results.
      // Only publication scheduling is controlled; this is not a full App/UI test.
      const ownership = createLatestInputRun();
      const oldRun = ownership.start();
      const oldSignal = trackSignal(oldRun);
      const oldResult = await within('old-completed-worker', run(oldRun.signal));
      // The result is computed, but its consumer has not published it yet.
      const newRun = ownership.start();
      const newSignal = trackSignal(newRun);
      const newCargo = cargo.map(item => ({ ...item, id: `${item.id}-NEW`, quantity: item.quantity + 1 }));
      const newPending = outcome(run(newRun.signal, newCargo));
      const acceptedOldResult = ownership.owns(oldRun);
      if (acceptedOldResult) publishLoadingResult(container, cargo, oldResult);
      const oldFinish = ownership.finish(oldRun);
      const newStillOwned = ownership.owns(newRun);
      const newOutcome = await within('replacement-worker', newPending);
      if (newOutcome.status !== 'fulfilled') throw new Error(`Replacement Worker failed: ${JSON.stringify(newOutcome)}`);
      const acceptedNewResult = ownership.owns(newRun);
      if (acceptedNewResult) publishLoadingResult(container, newCargo, newOutcome.result);
      const newFinish = ownership.finish(newRun);
      return {
        scenario, oldResult, newResult: newOutcome.result, newCargo,
        oldAborted: oldRun.signal.aborted, acceptedOldResult, oldFinish, newStillOwned,
        acceptedNewResult, newFinish, newOwnedAfterFinish: ownership.owns(newRun),
        oldSignal, newSignal, latestPublication: structuredClone(snapshotWindow.__containerLoadingLatestResult),
        ...diagnostics(),
      };
    }

    const controller = new AbortController();
    const signalTrace = trackSignal(controller);
    if (scenario === 'messageerror') nextBehavior = 'messageerror';
    // Null cargo is intentionally malformed test input, sent through native
    // postMessage. The real production worker must catch the engine exception
    // and return { error }, rather than any injected success/error payload.
    const failure = await within(scenario, outcome(run(controller.signal, scenario === 'returned-error' ? null as unknown as CargoItem[] : cargo)));
    controller.abort();
    return { scenario, failure, signalTrace, ...diagnostics() };
  } finally {
    window.Worker = NativeWorker;
    window.removeEventListener(LOADING_RESULT_EVENT, onPublication);
    window.removeEventListener('error', onGlobalError);
    window.removeEventListener('unhandledrejection', onUnhandled);
    // Bypass tracing so fixture disposal cannot masquerade as production cleanup.
    for (const worker of liveWorkers) NativeWorker.prototype.terminate.call(worker);
  }
}
