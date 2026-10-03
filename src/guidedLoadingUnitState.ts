import { createExternalStore } from './store/externalStore';

export type GuidedLoadingUnit = 'boxes' | 'pallets';

export const GUIDED_LOADING_UNIT_KEY = 'container-loading:guided-loading-unit';
export const GUIDED_LOADING_UNIT_EVENT = 'container-loading:guided-loading-unit-updated';

const store = createExternalStore<GuidedLoadingUnit | null>(null);
let hydrated = false;

export function normalizeGuidedLoadingUnit(value: unknown): GuidedLoadingUnit | null {
  // load-sim 규칙으로 단일화: 기존 boxes/pallets 선택값은 모두 일반 화물 유형 적재로 마이그레이션한다.
  return value === 'boxes' || value === 'pallets' ? 'boxes' : null;
}

export function guidedLoadingUnitLabel(unit: GuidedLoadingUnit | null | undefined) {
  if (unit === 'boxes') return '화물 유형 적재';
  if (unit === 'pallets') return '파렛트 적재';
  return '적재 유형 미선택';
}

export function readGuidedLoadingUnit() {
  if (!hydrated && typeof window !== 'undefined') {
    hydrated = true;
    store.setSnapshot(normalizeGuidedLoadingUnit(window.localStorage.getItem(GUIDED_LOADING_UNIT_KEY)));
  }
  return store.getSnapshot();
}

export function publishGuidedLoadingUnit(unit: GuidedLoadingUnit | null) {
  const normalized = normalizeGuidedLoadingUnit(unit);
  hydrated = true;
  store.setSnapshot(normalized);

  if (typeof window === 'undefined') return;
  if (normalized) window.localStorage.setItem(GUIDED_LOADING_UNIT_KEY, normalized);
  else window.localStorage.removeItem(GUIDED_LOADING_UNIT_KEY);
  window.dispatchEvent(new CustomEvent<GuidedLoadingUnit | null>(GUIDED_LOADING_UNIT_EVENT, { detail: normalized }));
}

export function subscribeGuidedLoadingUnit(listener: () => void) {
  readGuidedLoadingUnit();
  return store.subscribe(listener);
}

export function useGuidedLoadingUnit() {
  readGuidedLoadingUnit();
  return store.useSnapshot();
}
