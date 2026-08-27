import { useSyncExternalStore } from 'react';

export type ExternalStore<T> = {
  getSnapshot: () => T;
  setSnapshot: (next: T | ((current: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  useSnapshot: () => T;
};

/**
 * Small React-compatible domain store for state that must also be readable
 * from non-React engine/report modules.
 *
 * The store owns the source of truth. React components subscribe through
 * useSyncExternalStore while engine code can use getSnapshot/setSnapshot.
 */
export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  const getSnapshot = () => current;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const setSnapshot = (next: T | ((current: T) => T)) => {
    const resolved = typeof next === 'function'
      ? (next as (current: T) => T)(current)
      : next;
    if (Object.is(current, resolved)) return;
    current = resolved;
    listeners.forEach((listener) => listener());
  };
  const useSnapshot = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { getSnapshot, setSnapshot, subscribe, useSnapshot };
}
