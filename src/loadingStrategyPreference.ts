import type { LoadingStrategy } from './engine/loadingEngine';

export const LOADING_STRATEGY_PREFERENCE_KEY = 'container-loading:guided-loading-strategy';
export const LOADING_STRATEGY_PREFERENCE_EVENT = 'container-loading:guided-loading-strategy-updated';

/**
 * Owner decision 2026-11-20 (AGENTS.md 2K): the product offers no space-efficiency goal.
 * Stability is the one goal left. `capacity` stays an engine strategy for the engine's own
 * tests and the A-rules, but the product neither stores nor applies it.
 */
export const DEFAULT_LOADING_STRATEGY: LoadingStrategy = 'stability';

/** A goal as the product applies it: a stored or legacy `capacity` is read as stability. */
export function productLoadingStrategy(value: unknown): LoadingStrategy | null {
  if (value === 'capacity') return DEFAULT_LOADING_STRATEGY;
  return value === 'stability' || value === 'unloading' ? value : null;
}

/** The stored goal, or null while this job has none yet (packaging not confirmed). */
export function readLoadingStrategyPreference(): LoadingStrategy | null {
  if (typeof window === 'undefined') return null;
  return productLoadingStrategy(window.localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY));
}

/** The goal a plan is made with: the stored one, and stability when nothing is stored. */
export function currentLoadingStrategy(): LoadingStrategy {
  return readLoadingStrategyPreference() ?? DEFAULT_LOADING_STRATEGY;
}

export function writeLoadingStrategyPreference(strategy: LoadingStrategy | null) {
  if (typeof window === 'undefined') return;
  const next = productLoadingStrategy(strategy);
  if (next) window.localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, next);
  else window.localStorage.removeItem(LOADING_STRATEGY_PREFERENCE_KEY);
  window.dispatchEvent(new CustomEvent(LOADING_STRATEGY_PREFERENCE_EVENT, { detail: next }));
}
