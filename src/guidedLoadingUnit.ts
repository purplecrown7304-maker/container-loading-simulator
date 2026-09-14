export type GuidedLoadingUnit = 'boxes' | 'pallets';

export const GUIDED_LOADING_UNIT_KEY = 'container-loading:guided-loading-unit-v1';
export const GUIDED_LOADING_UNIT_EVENT = 'container-loading:guided-loading-unit-updated';

export function readGuidedLoadingUnit(): GuidedLoadingUnit {
  if (typeof window === 'undefined') return 'boxes';
  return window.localStorage.getItem(GUIDED_LOADING_UNIT_KEY) === 'pallets' ? 'pallets' : 'boxes';
}

export function writeGuidedLoadingUnit(unit: GuidedLoadingUnit) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUIDED_LOADING_UNIT_KEY, unit);
  window.dispatchEvent(new CustomEvent<GuidedLoadingUnit>(GUIDED_LOADING_UNIT_EVENT, { detail: unit }));
}
