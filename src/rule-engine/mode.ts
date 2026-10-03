export type RuleEngineMode = 'legacy' | 'load-sim';

export const RULE_ENGINE_MODE_STORAGE_KEY = 'container-loading:rule-engine-mode-v1';

export function readRuleEngineMode(): RuleEngineMode {
  if (typeof window === 'undefined') return 'legacy';
  return window.localStorage?.getItem(RULE_ENGINE_MODE_STORAGE_KEY) === 'load-sim' ? 'load-sim' : 'legacy';
}

export function writeRuleEngineMode(mode: RuleEngineMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RULE_ENGINE_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent('container-loading:rule-engine-mode', { detail: mode }));
}
