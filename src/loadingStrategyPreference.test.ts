import { afterEach, expect, it } from 'vitest';
import { LOADING_STRATEGY_PREFERENCE_KEY, readLoadingStrategyPreference, writeLoadingStrategyPreference } from './loadingStrategyPreference';

afterEach(() => localStorage.clear());

it('normalizes saved B objectives to the sole A method confirmation', () => {
  for (const oldObjective of ['capacity', 'stability', 'unloading']) {
    localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, oldObjective);
    expect(readLoadingStrategyPreference()).toBe('capacity');
  }
});
it('never writes a retired objective back into the active preference', () => {
  writeLoadingStrategyPreference('unloading');
  expect(localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY)).toBe('capacity');
  writeLoadingStrategyPreference(null);
  expect(readLoadingStrategyPreference()).toBeNull();
});
