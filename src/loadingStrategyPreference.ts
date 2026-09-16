import type { LoadingStrategy } from './engine/loadingEngine';

export const LOADING_STRATEGY_PREFERENCE_KEY = 'container-loading:guided-loading-strategy';
export const LOADING_STRATEGY_PREFERENCE_EVENT = 'container-loading:guided-loading-strategy-updated';

const ALLOWED_STRATEGIES: LoadingStrategy[] = ['stability', 'capacity', 'unloading'];

export function readLoadingStrategyPreference(): LoadingStrategy | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY) as LoadingStrategy | null;
  return value && ALLOWED_STRATEGIES.includes(value) ? value : null;
}

export function writeLoadingStrategyPreference(strategy: LoadingStrategy | null) {
  if (typeof window === 'undefined') return;
  if (strategy) window.localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, strategy);
  else window.localStorage.removeItem(LOADING_STRATEGY_PREFERENCE_KEY);
  window.dispatchEvent(new CustomEvent(LOADING_STRATEGY_PREFERENCE_EVENT, { detail: strategy }));
}
