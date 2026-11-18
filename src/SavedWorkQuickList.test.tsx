import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SavedWorkQuickList from './SavedWorkQuickList';
import { setUiLanguage } from './uiLanguage';

const KEY = 'container-loading-workspace-boxes-v1';
const work = (id: string, savedAt: string) => ({ id, name: `계획 ${id}`, savedAt,
  state: { container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    cargo: [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 5, quantity: 10 }] } });
let root: Root, mount: HTMLDivElement, page: HTMLDivElement;
const names = () => [...page.querySelectorAll('.saved-work-quick-items article')].map(item => item.getAttribute('aria-label'));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  setUiLanguage('ko'); localStorage.clear();
  page = document.createElement('div'); page.innerHTML = '<div class="guided-job-summary"></div>';
  mount = document.createElement('div'); document.body.append(page, mount); root = createRoot(mount);
});
afterEach(() => { act(() => root.unmount()); page.remove(); mount.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('parses saved work only when the stored value changes and still shows a later save', () => {
  localStorage.setItem(KEY, JSON.stringify([work('1', '2026-11-01T00:00:00Z')]));
  act(() => root.render(<SavedWorkQuickList />));
  act(() => { vi.advanceTimersByTime(50); });
  expect(names()).toEqual(['계획 1 계획 불러오기']);

  const parse = vi.spyOn(JSON, 'parse');
  act(() => { vi.advanceTimersByTime(1200 * 10); });
  // Ten polls of an unchanged store used to parse every saved plan ten times.
  expect(parse).not.toHaveBeenCalled();

  localStorage.setItem(KEY, JSON.stringify([work('1', '2026-11-01T00:00:00Z'), work('2', '2026-11-02T00:00:00Z')]));
  act(() => { vi.advanceTimersByTime(1200); });
  expect(parse).toHaveBeenCalledOnce();
  expect(names()).toEqual(['계획 2 계획 불러오기', '계획 1 계획 불러오기']);

  localStorage.removeItem(KEY);
  act(() => { vi.advanceTimersByTime(1200); });
  expect(names()).toEqual([]);
});
