import { useSyncExternalStore } from 'react';

export const VIEWER_ENVIRONMENTS = [
  { id: 'forest', label: '숲속' },
  { id: 'warehouse', label: '물류창고' },
  { id: 'beach', label: '해변' },
  { id: 'space', label: '우주' },
] as const;
export type EnvironmentId = typeof VIEWER_ENVIRONMENTS[number]['id'];
export const DEFAULT_VIEWER_ENVIRONMENT: EnvironmentId = 'warehouse';
export const VIEWER_ENVIRONMENT_STORAGE_KEY = 'container-loading:viewer-environment';
export const VIEWER_ENVIRONMENT_EVENT = 'container-loading:viewer-environment-changed';
let sessionEnvironment: EnvironmentId = DEFAULT_VIEWER_ENVIRONMENT;
let unsavedEnvironment = false;

export function normalizeViewerEnvironment(value: unknown): EnvironmentId {
  return VIEWER_ENVIRONMENTS.some(option => option.id === value) ? value as EnvironmentId : DEFAULT_VIEWER_ENVIRONMENT;
}

/** A display preference, deliberately separate from cargo and inspection inputs. */
export function readViewerEnvironment(): EnvironmentId {
  if (unsavedEnvironment) return sessionEnvironment;
  try { return normalizeViewerEnvironment(sessionStorage.getItem(VIEWER_ENVIRONMENT_STORAGE_KEY)); }
  catch { return sessionEnvironment; }
}

export function saveViewerEnvironment(value: EnvironmentId): void {
  sessionEnvironment = normalizeViewerEnvironment(value);
  // Session-only display preference stays outside guest/company input storage.
  try { sessionStorage.setItem(VIEWER_ENVIRONMENT_STORAGE_KEY, sessionEnvironment); unsavedEnvironment = false; }
  catch { unsavedEnvironment = true; /* Keep the selected background even when storage is full or blocked. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VIEWER_ENVIRONMENT_EVENT));
}

function subscribeViewerEnvironment(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === VIEWER_ENVIRONMENT_STORAGE_KEY) listener();
  };
  window.addEventListener(VIEWER_ENVIRONMENT_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(VIEWER_ENVIRONMENT_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Header and retained viewers share only a display preference, never a loading input. */
export function useViewerEnvironment() {
  return useSyncExternalStore(subscribeViewerEnvironment, readViewerEnvironment, () => DEFAULT_VIEWER_ENVIRONMENT);
}
