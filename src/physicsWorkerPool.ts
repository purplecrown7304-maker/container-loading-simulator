import { runPhysicsScenarioJob, type PhysicsScenarioJob, type PhysicsScenarioJobResult } from './engine/physicsScenarioJob';

/**
 * Small pool of Rapier workers. Each job is one independent, deterministic scenario, so the pool
 * size and scheduling only change how fast results arrive, never what they are.
 *
 * - Jobs run FIFO; a cancelled queued job is removed, a cancelled running job terminates its worker.
 * - Without browser Workers (unit tests, Node), or after a worker fails to start, jobs run on the
 *   current thread through the same function, one at a time (the memory profile of the old
 *   sequential code).
 */
type WorkerLike = {
  postMessage: (message: unknown) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event | ErrorEvent) => void) | null;
};
type WorkerFactory = () => WorkerLike;

type Task = {
  id: number;
  job: PhysicsScenarioJob;
  onProgress?: (value: number) => void;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};
type Slot = { worker: WorkerLike | null; task: Task | null; idleTimer: ReturnType<typeof setTimeout> | null };

// A 9,200-box world needs about 200 MB; three workers cover one securing level (three scenarios).
const MAX_WORKERS = 3;
const IDLE_TERMINATE_MS = 60_000;

let nextId = 1;
let factory: WorkerFactory | null | undefined;
let workersBroken = false;
let inThreadBusy = false;
const queue: Task[] = [];
const slots: Slot[] = [];

function defaultFactory(): WorkerFactory | null {
  if (typeof Worker === 'undefined') return null;
  return () => new Worker(new URL('./engine/physicsScenario.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

function currentFactory() {
  if (factory === undefined) factory = defaultFactory();
  return workersBroken ? null : factory;
}

/** Number of parallel scenario workers: one core is left for the page. */
export function physicsWorkerCount() {
  const cores = typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(MAX_WORKERS, Math.floor(cores) - 1));
}

/** Test hook: inject a worker implementation (null = run on the current thread). */
export function setPhysicsWorkerFactoryForTests(next: WorkerFactory | null | undefined) {
  resetPhysicsWorkerPool();
  factory = next;
  workersBroken = false;
}

export function resetPhysicsWorkerPool() {
  for (const slot of slots) {
    slot.worker?.terminate();
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.task?.reject(abortError());
  }
  slots.length = 0;
  for (const task of queue.splice(0)) task.reject(abortError());
}

function abortError() {
  return new DOMException('취소됨', 'AbortError');
}

function detach(task: Task) {
  if (task.onAbort) task.signal?.removeEventListener('abort', task.onAbort);
}

function finish(slot: Slot, task: Task) {
  detach(task);
  slot.task = null;
  if (slot.idleTimer) clearTimeout(slot.idleTimer);
  slot.idleTimer = setTimeout(() => {
    if (slot.task) return;
    slot.worker?.terminate();
    slot.worker = null;
    slot.idleTimer = null;
  }, IDLE_TERMINATE_MS);
  pump();
}

/** Current-thread fallback: one scenario at a time, like the old sequential code. */
function runNextOnCurrentThread() {
  if (inThreadBusy) return;
  const task = queue.shift();
  if (!task) return;
  inThreadBusy = true;
  const done = () => { inThreadBusy = false; detach(task); runNextOnCurrentThread(); };
  runPhysicsScenarioJob(task.job, task.onProgress, () => Boolean(task.signal?.aborted))
    .then(result => {
      done();
      if (task.signal?.aborted) task.reject(abortError()); else task.resolve(result);
    }, error => {
      done();
      task.reject(task.signal?.aborted ? abortError() : error);
    });
}

/** Workers cannot be used: move every queued or orphaned task to the current thread. */
function breakWorkers(orphans: Task[]) {
  workersBroken = true;
  for (const slot of slots) {
    if (slot.task) orphans.push(slot.task);
    slot.worker?.terminate();
    slot.worker = null;
    slot.task = null;
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
  }
  // Restart them in submission order, ahead of anything still queued.
  queue.unshift(...orphans.sort((a, b) => a.id - b.id));
  runNextOnCurrentThread();
}

function startOn(slot: Slot, task: Task, make: WorkerFactory) {
  if (slot.idleTimer) { clearTimeout(slot.idleTimer); slot.idleTimer = null; }
  if (!slot.worker) {
    let worker: WorkerLike;
    try {
      worker = make();
    } catch {
      // e.g. a blocked module worker (CSP, opaque origin): run on the current thread instead.
      breakWorkers([task]);
      return false;
    }
    worker.onmessage = (event: MessageEvent<{ id: number; progress?: number; result?: unknown; error?: string }>) => {
      if (slot.worker !== worker) return;
      const current = slot.task;
      if (!current || event.data.id !== current.id) return;
      if (event.data.progress !== undefined) { current.onProgress?.(event.data.progress); return; }
      finish(slot, current);
      if (event.data.error !== undefined) current.reject(new Error(event.data.error));
      else current.resolve(event.data.result);
    };
    worker.onerror = () => {
      // The worker script itself failed. Ignore late errors from a worker already replaced.
      if (slot.worker !== worker) return;
      const current = slot.task;
      worker.terminate();
      slot.worker = null;
      slot.task = null;
      breakWorkers(current ? [current] : []);
    };
    slot.worker = worker;
  }
  slot.task = task;
  slot.worker.postMessage({ id: task.id, job: task.job });
  return true;
}

function pump() {
  const make = currentFactory();
  if (!make) { runNextOnCurrentThread(); return; }
  while (queue.length && !workersBroken) {
    let slot = slots.find(candidate => !candidate.task);
    if (!slot && slots.length < physicsWorkerCount()) {
      slot = { worker: null, task: null, idleTimer: null };
      slots.push(slot);
    }
    if (!slot) return;
    if (!startOn(slot, queue.shift()!, make)) return;
  }
}

/** Runs one scenario on the pool. Same inputs give the same result as the direct call. */
export function runPhysicsScenarioPooled<J extends PhysicsScenarioJob>(
  job: J,
  onProgress?: (value: number) => void,
  signal?: AbortSignal,
): Promise<PhysicsScenarioJobResult<J>> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const task: Task = { id: nextId++, job, onProgress, resolve: resolve as (value: unknown) => void, reject, signal };
    task.onAbort = () => {
      const queued = queue.indexOf(task);
      if (queued >= 0) { queue.splice(queued, 1); reject(abortError()); return; }
      const slot = slots.find(candidate => candidate.task === task);
      if (slot) {
        slot.worker?.terminate();
        slot.worker = null;
        slot.task = null;
        reject(abortError());
        pump();
      }
      // A current-thread task stops at its next cancellation check.
    };
    signal?.addEventListener('abort', task.onAbort, { once: true });
    queue.push(task);
    pump();
  });
}
