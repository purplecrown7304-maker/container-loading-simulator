import { useSyncExternalStore } from 'react';
import { uiMessages } from './uiMessages';

export type UiLanguage = 'ko' | 'en' | 'vi';
export const UI_LANGUAGE_KEY = 'load-studio-ui-language';
export const UI_LANGUAGE_EVENT = 'load-studio:ui-language-changed';
export const UI_LANGUAGES = [
  { id: 'ko', label: '한국어' }, { id: 'en', label: 'English' }, { id: 'vi', label: 'Tiếng Việt' },
] as const;

// Capture the native preference store before app data persistence replaces localStorage.
// A display preference must not enter company data, loading inputs or certification signatures.
const preferenceStorage = (() => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } })();
export function normalizeUiLanguage(value: unknown): UiLanguage | null {
  return value === 'ko' || value === 'en' || value === 'vi' ? value : null;
}
function savedLanguage(): UiLanguage {
  try { return normalizeUiLanguage(preferenceStorage?.getItem(UI_LANGUAGE_KEY)) ?? 'ko'; } catch { return 'ko'; }
}
let language = savedLanguage();
const listeners = new Set<() => void>();
export const readUiLanguage = () => language;
function publish(next: UiLanguage) {
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (language === next) return;
  language = next;
  listeners.forEach(listener => listener());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UI_LANGUAGE_EVENT, { detail: next }));
}
export function setUiLanguage(value: unknown): void {
  const next = normalizeUiLanguage(value);
  if (!next) return;
  try { preferenceStorage?.setItem(UI_LANGUAGE_KEY, next); } catch { /* Keep the switch usable when storage is blocked. */ }
  publish(next);
}
function onStorage(event: StorageEvent) {
  if (event.key === UI_LANGUAGE_KEY || event.key === null) publish(savedLanguage());
}
function subscribe(listener: () => void) {
  if (!listeners.size && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
export function useUiLanguage() { return useSyncExternalStore(subscribe, readUiLanguage, () => 'ko' as const); }
export function initializeUiLanguage() { publish(savedLanguage()); }

/** Translate presentation copy only. Unknown domain messages remain visible in their original language. */
export function uiText(text: string, values: readonly (string | number)[] = [], locale = language): string {
  const translated = locale === 'ko' ? text : uiMessages[text]?.[locale === 'en' ? 0 : 1] ?? text;
  return translated.replace(/\{(\d+)\}/g, (token, index: string) => values[Number(index)] === undefined ? token : String(values[Number(index)]));
}
