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
export const uiLocale = (locale: UiLanguage = language) => ({ ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' }[locale]);
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
  const exact = uiMessages[text];
  const pair = exact ?? uiMessages[text.trim()];
  const translated = locale === 'ko' || !pair ? text : exact ? pair[locale === 'en' ? 0 : 1] : text.replace(text.trim(), pair[locale === 'en' ? 0 : 1]);
  return translated.replace(/\{(\d+)\}/g, (token, index: string) => values[Number(index)] === undefined ? token : String(values[Number(index)]));
}

// Only these engine-owned slots contain another diagnostic, rather than an ID/name/value.
// Joined or unknown inner text stays intact unless it matches a complete known message.
const diagnosticSlots: Readonly<Record<string, readonly number[]>> = {
  '미적재 {0}개: {1}': [1],
  '원래 장비 입력 오류: {0}': [0],
  '원래 화물 입력 오류 ({0}): {1}': [1],
  '{0} (필수 고정재 중량 {1}kg 포함)': [0],
  '최상단 최소충전율 {0}% 적용 후: {1}': [1],
  'WHAT-IF REVIEW 계산 차단: {0}': [0],
  'A 규칙 최종 검사 실패: {0}': [0],
};

/** Localize app-generated diagnostics only. Captures are opaque except for the explicitly
 * documented diagnostic slots above; product names/IDs and unknown messages remain intact.
 */
export function uiMessage(text: string, locale: UiLanguage = language): string {
  return translateMessage(text, locale, 0);
}
function translateMessage(text: string, locale: UiLanguage, depth: number): string {
  if (locale === 'ko' || depth > 6) return text;
  const exact = uiText(text, [], locale);
  if (exact !== text) return exact;
  for (const { pattern, key, indexes } of messageTemplates) {
    const match = pattern.exec(text);
    if (!match) continue;
    const values: string[] = [];
    indexes.forEach((index, i) => {
      const value = match[i + 1];
      values[index] = diagnosticSlots[key]?.includes(index) ? translateMessage(value, locale, depth + 1) : value;
    });
    return uiText(key, values, locale);
  }
  return text;
}
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const messageTemplates = Object.keys(uiMessages).filter(key => /\{\d+\}/.test(key)).map(key => {
  const indexes: number[] = [];
  let end = 0; let pattern = '^';
  // Compact unit labels such as '{0}단' must not reinterpret an unknown word ending in 단.
  // They are matched implicitly only for numbers; opaque values use explicit uiText templates.
  const numericOnly = key.replace(/\{\d+\}|\s/g, '').length < 6;
  for (const match of key.matchAll(/\{(\d+)\}/g)) {
    const capture = numericOnly && !diagnosticSlots[key]?.includes(Number(match[1])) ? '([+-]?\\d[\\d,.]*)' : '([\\s\\S]*?)';
    pattern += escapePattern(key.slice(end, match.index)) + capture;
    indexes.push(Number(match[1])); end = match.index! + match[0].length;
  }
  return { key, indexes, pattern: new RegExp(pattern + escapePattern(key.slice(end)) + '$') };
}).sort((a, b) => Number(Boolean(diagnosticSlots[b.key])) - Number(Boolean(diagnosticSlots[a.key]))
  || b.key.replace(/\{\d+\}/g, '').length - a.key.replace(/\{\d+\}/g, '').length);
