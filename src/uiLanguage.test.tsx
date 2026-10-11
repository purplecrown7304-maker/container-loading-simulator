// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LanguageSwitcher from './LanguageSwitcher';
import { initializeUiLanguage, normalizeUiLanguage, readUiLanguage, setUiLanguage, UI_LANGUAGE_EVENT, UI_LANGUAGE_KEY, uiText } from './uiLanguage';
import { uiMessages } from './uiMessages';

let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setUiLanguage('ko');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); localStorage.removeItem(UI_LANGUAGE_KEY); vi.restoreAllMocks(); });

it('switches the UI language without changing any loading data or publishing a loading event', async () => {
  const sentinel = JSON.stringify({ product: '한국어 제품', qty: 168, gap: .001, result: { revision: 'r1', status: 'failed' } });
  localStorage.setItem('container-loading:sentinel', sentinel);
  const event = vi.fn(); const inputEvent = vi.fn();
  window.addEventListener(UI_LANGUAGE_EVENT, event); window.addEventListener('container-loading:storage-updated', inputEvent);
  try {
    await act(async () => root.render(<LanguageSwitcher />));
    const buttons = host.querySelectorAll('button');
    expect([...buttons].map(b => b.textContent)).toEqual(['한국어', 'English', 'Tiếng Việt']);
    await act(async () => buttons[1].click());
    expect(document.documentElement.lang).toBe('en'); expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(uiText('로그인')).toBe('Sign in');
    await act(async () => buttons[2].click());
    expect(readUiLanguage()).toBe('vi'); expect(uiText('로그인')).toBe('Đăng nhập');
    expect(localStorage.getItem(UI_LANGUAGE_KEY)).toBe('vi');
    expect(localStorage.getItem('container-loading:sentinel')).toBe(sentinel); expect(inputEvent).not.toHaveBeenCalled(); expect(event).toHaveBeenCalledTimes(2);
    setUiLanguage('unsupported'); expect(readUiLanguage()).toBe('vi');
  } finally { window.removeEventListener(UI_LANGUAGE_EVENT, event); window.removeEventListener('container-loading:storage-updated', inputEvent); }
});

it('restores saved preference and handles cross-tab storage events without writing other keys', async () => {
  await act(async () => root.render(<LanguageSwitcher />));
  localStorage.setItem(UI_LANGUAGE_KEY, 'vi');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: UI_LANGUAGE_KEY, newValue: 'vi', storageArea: localStorage })));
  expect(readUiLanguage()).toBe('vi'); expect(document.documentElement.lang).toBe('vi');
  localStorage.setItem(UI_LANGUAGE_KEY, 'en'); await act(async () => initializeUiLanguage());
  expect(readUiLanguage()).toBe('en'); expect(host.querySelector('[lang="en"]')?.getAttribute('aria-pressed')).toBe('true');
  localStorage.setItem(UI_LANGUAGE_KEY, 'bad'); await act(async () => initializeUiLanguage());
  expect(readUiLanguage()).toBe('ko'); expect(normalizeUiLanguage('fr')).toBeNull();
});

it('keeps switching usable if preference storage is unavailable', async () => {
  await act(async () => root.render(<LanguageSwitcher />));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  await act(async () => setUiLanguage('vi'));
  expect(readUiLanguage()).toBe('vi'); expect(document.documentElement.lang).toBe('vi');
});

it('preserves placeholder data verbatim and leaves unknown diagnostic messages visible', () => {
  expect(uiText('{0} 박스 내부 보기', ['사용자 제품 <b>A</b>'], 'en')).toBe('View contents of 사용자 제품 <b>A</b> carton');
  expect(uiText('미등록 진단 CODE_X', [], 'vi')).toBe('미등록 진단 CODE_X');
  for (const [key, translations] of Object.entries(uiMessages)) {
    const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
    expect(translations).toHaveLength(2);
    for (const value of translations) { expect(value.trim()).not.toBe(''); expect(placeholders(value)).toEqual(placeholders(key)); }
  }
});
