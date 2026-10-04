import type { LoadingStrategy } from './engine/loadingEngine';

export const LOADING_STRATEGY_PREFERENCE_KEY = 'container-loading:guided-loading-strategy';
export const LOADING_STRATEGY_PREFERENCE_EVENT = 'container-loading:guided-loading-strategy-updated';

export function readLoadingStrategyPreference(): LoadingStrategy | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY) as LoadingStrategy | null;
  // Old saved objectives only mean the method was confirmed. They cannot select
  // a retired algorithm or alter A pack's internally chosen sorting strategy.
  return value === 'capacity' || value === 'stability' || value === 'unloading' ? 'capacity' : null;
}

export function writeLoadingStrategyPreference(strategy: LoadingStrategy | null) {
  if (typeof window === 'undefined') return;
  if (strategy) window.localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, 'capacity');
  else window.localStorage.removeItem(LOADING_STRATEGY_PREFERENCE_KEY);
  window.dispatchEvent(new CustomEvent(LOADING_STRATEGY_PREFERENCE_EVENT, { detail: strategy ? 'capacity' : null }));
}
