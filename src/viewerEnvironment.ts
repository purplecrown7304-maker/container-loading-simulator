export const VIEWER_ENVIRONMENTS = [
  { id: 'forest', label: '숲속' },
  { id: 'warehouse', label: '물류창고' },
  { id: 'beach', label: '해변' },
  { id: 'space', label: '우주' },
] as const;
export type EnvironmentId = typeof VIEWER_ENVIRONMENTS[number]['id'];
export const DEFAULT_VIEWER_ENVIRONMENT: EnvironmentId = 'warehouse';
export const VIEWER_ENVIRONMENT_STORAGE_KEY = 'container-loading:viewer-environment';

export function normalizeViewerEnvironment(value: unknown): EnvironmentId {
  return VIEWER_ENVIRONMENTS.some(option => option.id === value) ? value as EnvironmentId : DEFAULT_VIEWER_ENVIRONMENT;
}

/** A display preference, deliberately separate from cargo and inspection inputs. */
export function readViewerEnvironment(): EnvironmentId {
  try { return normalizeViewerEnvironment(localStorage.getItem(VIEWER_ENVIRONMENT_STORAGE_KEY)); }
  catch { return DEFAULT_VIEWER_ENVIRONMENT; }
}

export function saveViewerEnvironment(value: EnvironmentId): void {
  try { localStorage.setItem(VIEWER_ENVIRONMENT_STORAGE_KEY, value); }
  catch { /* Restricted storage still allows this viewer to change its background. */ }
}
