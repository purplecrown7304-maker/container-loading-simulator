import type { InertiaAnimationResult, InertiaSecuringProfile } from './engine/inertiaSimulation';
import type { PhysicsScenario, PhysicsSupport } from './engine/physicsValidation';
import type { ContainerSpec, Placement } from './engine/types';
import { runPhysicsScenarioPooled } from './physicsWorkerPool';

/**
 * Shared inertia scenario runs.
 *
 * A run is keyed by every input the simulation reads (container, placements, scenario, supports,
 * securing profile). The simulation is deterministic, so a cached or in-flight run for the same
 * key is exactly the result a fresh run would produce. This lets certification start the three
 * scenarios of a securing level concurrently and lets the work-order completion step reuse a
 * scenario that was already computed, without changing any recorded result.
 *
 * Runs are reference counted per session. Releasing a session aborts runs nobody else holds,
 * unless the session asked to keep them (the last securing level, which completion may need).
 */
type Entry = {
  targetKey: string;
  promise: Promise<InertiaAnimationResult>;
  controller: AbortController;
  holders: number;
  keep: boolean;
  settled: boolean;
  progress: number;
  listeners: Set<(value: number) => void>;
};

const MAX_SETTLED_ENTRIES = 12;
const entries = new Map<string, Entry>();

export type InertiaRunInputs = {
  container: ContainerSpec;
  placements: Placement[];
  scenario: PhysicsScenario;
  supports: PhysicsSupport[];
  securing?: InertiaSecuringProfile;
};

/** Precomputed container+placements part of a key; build once per target. */
export function inertiaTargetKey(container: ContainerSpec, placements: Placement[]) {
  return JSON.stringify([container, placements]);
}

function runKey(targetKey: string, inputs: InertiaRunInputs) {
  return `${targetKey}|${inputs.scenario}|${JSON.stringify(inputs.supports)}|${JSON.stringify(inputs.securing ?? null)}`;
}

function evictSettled() {
  const settled = [...entries.entries()].filter(([, entry]) => entry.settled && entry.holders === 0);
  for (const [key] of settled.slice(0, Math.max(0, settled.length - MAX_SETTLED_ENTRIES))) entries.delete(key);
}

function abortIfUnheld(key: string, entry: Entry) {
  if (entry.holders > 0 || entry.keep || entry.settled) return;
  entry.controller.abort();
  entries.delete(key);
}

export type InertiaRunSession = {
  /** Starts (or joins) a run. Progress is forwarded while the caller is waiting on it. */
  start: (targetKey: string, inputs: InertiaRunInputs) => InertiaRunHandle;
  /** Drops this session's holds. Unheld, unfinished runs are aborted unless kept. */
  release: (options?: { abortAll?: boolean }) => void;
};

export type InertiaRunHandle = {
  wait: () => Promise<InertiaAnimationResult>;
  /** Progress of the shared run; returns an unsubscribe function. */
  subscribe: (listener: (value: number) => void) => () => void;
  /** This session no longer needs the run; abort it if nobody else does. */
  drop: () => void;
  /** Keep the run going after the session is released (completion may reuse it). */
  keep: () => void;
};

export function createInertiaRunSession(): InertiaRunSession {
  const held = new Map<string, Entry>();

  const start = (targetKey: string, inputs: InertiaRunInputs): InertiaRunHandle => {
    const key = runKey(targetKey, inputs);
    let entry = entries.get(key);
    if (!entry) {
      // Kept runs only serve the completion step of their own target. Once another target starts,
      // nobody will ask for them: stop any that are still running so they do not hold workers.
      for (const [otherKey, other] of entries) {
        if (other.keep && !other.settled && other.holders === 0 && other.targetKey !== targetKey) {
          other.controller.abort();
          entries.delete(otherKey);
        }
      }
      const controller = new AbortController();
      const created: Entry = { targetKey, controller, holders: 0, keep: false, settled: false, progress: 0, listeners: new Set(), promise: Promise.resolve() as unknown as Promise<InertiaAnimationResult> };
      created.promise = runPhysicsScenarioPooled(
        { kind: 'inertia', container: inputs.container, placements: inputs.placements, scenario: inputs.scenario, supports: inputs.supports, securing: inputs.securing },
        value => { created.progress = value; created.listeners.forEach(listener => listener(value)); },
        controller.signal,
      ).then(result => {
        created.settled = true;
        created.progress = 1;
        evictSettled();
        return result;
      }, error => {
        // Failed or aborted runs are never reused.
        if (entries.get(key) === created) entries.delete(key);
        throw error;
      });
      // Avoid unhandled rejections for prefetched runs nobody awaits.
      created.promise.catch(() => undefined);
      entries.set(key, created);
      entry = created;
    }
    if (!held.has(key)) { entry.holders += 1; held.set(key, entry); }
    const current = entry;
    return {
      wait: () => current.promise,
      subscribe: listener => {
        listener(current.progress);
        current.listeners.add(listener);
        return () => { current.listeners.delete(listener); };
      },
      drop: () => {
        if (held.get(key) !== current) return;
        held.delete(key);
        current.holders -= 1;
        abortIfUnheld(key, current);
      },
      keep: () => { current.keep = true; },
    };
  };

  const release = (options: { abortAll?: boolean } = {}) => {
    for (const [key, entry] of held) {
      entry.holders -= 1;
      if (options.abortAll && !entry.settled && entry.holders === 0) {
        entry.controller.abort();
        if (entries.get(key) === entry) entries.delete(key);
        continue;
      }
      abortIfUnheld(key, entry);
    }
    held.clear();
  };

  return { start, release };
}

/**
 * Waits for a run, forwarding its progress, and polls the caller's cancellation callback.
 * On cancellation it throws `cancelMessage` (classified as cancelled by the workflow state).
 */
export async function waitForInertiaRun(
  run: InertiaRunHandle,
  onProgress: (value: number) => void,
  shouldCancel: (() => boolean) | undefined,
  cancelMessage: string,
): Promise<InertiaAnimationResult> {
  const unsubscribe = run.subscribe(onProgress);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (!shouldCancel) return await run.wait();
    const cancelled = new Promise<never>((_, reject) => {
      timer = setInterval(() => { if (shouldCancel()) reject(new Error(cancelMessage)); }, 100);
    });
    const result = await Promise.race([run.wait(), cancelled]);
    if (shouldCancel()) throw new Error(cancelMessage);
    return result;
  } finally {
    clearInterval(timer);
    unsubscribe();
  }
}

/** Test helper. */
export function clearInertiaScenarioRuns() {
  for (const entry of entries.values()) if (!entry.settled) entry.controller.abort();
  entries.clear();
}
