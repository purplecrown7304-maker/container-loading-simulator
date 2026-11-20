import { beforeEach, expect, it } from 'vitest';
import { DEFAULT_LOADING_STRATEGY, LOADING_STRATEGY_PREFERENCE_EVENT, LOADING_STRATEGY_PREFERENCE_KEY, currentLoadingStrategy,
  productLoadingStrategy, readLoadingStrategyPreference, writeLoadingStrategyPreference } from './loadingStrategyPreference';

// Owner decision 2026-11-20 (AGENTS.md 2K): the product offers no space-efficiency goal.
beforeEach(() => localStorage.clear());

it('plans with stability when the job has stored no goal', () => {
  expect(DEFAULT_LOADING_STRATEGY).toBe('stability');
  expect(readLoadingStrategyPreference()).toBeNull();
  expect(currentLoadingStrategy()).toBe('stability');
});

it('reads a stored space-efficiency goal as stability and keeps the other stored goals', () => {
  for (const [stored, applied] of [['capacity', 'stability'], ['stability', 'stability'], ['unloading', 'unloading']] as const) {
    localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, stored);
    expect(readLoadingStrategyPreference()).toBe(applied);
    expect(currentLoadingStrategy()).toBe(applied);
  }
  localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, 'fastest');
  expect(readLoadingStrategyPreference()).toBeNull();
  expect(productLoadingStrategy(undefined)).toBeNull();
});

it('never stores or announces the space-efficiency goal', () => {
  const announced: unknown[] = [];
  const listen = (event: Event) => announced.push((event as CustomEvent).detail);
  window.addEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, listen);
  try {
    writeLoadingStrategyPreference('capacity');
    expect(localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY)).toBe('stability');
    writeLoadingStrategyPreference(null);
    expect(localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY)).toBeNull();
    expect(announced).toEqual(['stability', null]);
  } finally { window.removeEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, listen); }
});
