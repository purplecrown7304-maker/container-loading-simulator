import { useSyncExternalStore } from 'react';

export type ViewerQuality = 'high' | 'standard' | 'performance';
export type ViewerQualityPreference = { quality: ViewerQuality; ambientOcclusion: boolean };
export const VIEWER_QUALITY_OPTIONS = [
  { value: 'high', label: '고품질' }, { value: 'standard', label: '표준' }, { value: 'performance', label: '성능 우선' },
] as const;
export const VIEWER_QUALITY_KEY = 'container-loading:viewer-quality';
export const VIEWER_QUALITY_EVENT = 'container-loading:viewer-quality-changed';
/** Display costs only. Never part of a cargo, packaging or certification input. */
export const VIEWER_QUALITY_PROFILES = {
  high: { dpr: [1, 1.5] as [number, number], aoScale: 1, aoSamples: 16, msaaSamples: 4 },
  standard: { dpr: [1, 1.25] as [number, number], aoScale: .5, aoSamples: 8, msaaSamples: 2 },
  performance: { dpr: [1, 1] as [number, number], aoScale: 0, aoSamples: 0, msaaSamples: 0 },
} as const;
const preferences = new Map<string, ViewerQualityPreference>();
for (const option of VIEWER_QUALITY_OPTIONS) for (const ambientOcclusion of [false, true]) {
  preferences.set(`${option.value}:${ambientOcclusion ? 'on' : 'off'}`, Object.freeze({ quality: option.value, ambientOcclusion }));
}
const defaultPreference = preferences.get('standard:on')!;
let transient: ViewerQualityPreference | null = null;
export function readViewerQuality(): ViewerQualityPreference {
  if (transient) return transient;
  try { return preferences.get(sessionStorage.getItem(VIEWER_QUALITY_KEY) ?? '') ?? defaultPreference; }
  catch { return defaultPreference; }
}
export function saveViewerQuality(value: ViewerQualityPreference) {
  const key = `${value.quality}:${value.ambientOcclusion ? 'on' : 'off'}`;
  const normalized = preferences.get(key) ?? defaultPreference;
  try { sessionStorage.setItem(VIEWER_QUALITY_KEY, `${normalized.quality}:${normalized.ambientOcclusion ? 'on' : 'off'}`); transient = null; }
  catch { transient = normalized; }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VIEWER_QUALITY_EVENT));
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === VIEWER_QUALITY_KEY) listener(); };
  window.addEventListener(VIEWER_QUALITY_EVENT, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(VIEWER_QUALITY_EVENT, listener); window.removeEventListener('storage', storage); };
}
export function useViewerQuality() { return useSyncExternalStore(subscribe, readViewerQuality, () => defaultPreference); }
