import { createExternalStore } from './store/externalStore';

export type ComparisonRenderer = 'unity' | 'three';
export function parseViewerComparison(search: string) {
  const value = new URLSearchParams(search).get('renderer');
  return { enabled: true, renderer: value === 'unity' || value === 'compare' ? 'unity' as const : 'three' as const };
}
const initial = parseViewerComparison(typeof window === 'undefined' ? '' : window.location.search);
const store = createExternalStore(initial);
export const useViewerComparison = store.useSnapshot;
/** View-only session switch: no loading inputs, certification or stored data change. */
export function setComparisonRenderer(renderer: ComparisonRenderer) {
  if (!store.getSnapshot().enabled) return;
  const url = new URL(window.location.href);
  url.searchParams.set('renderer', renderer);
  window.history.replaceState(window.history.state, '', url);
  store.setSnapshot({ enabled: true, renderer });
}
if (typeof window !== 'undefined') window.addEventListener('popstate', () => store.setSnapshot(parseViewerComparison(window.location.search)));
