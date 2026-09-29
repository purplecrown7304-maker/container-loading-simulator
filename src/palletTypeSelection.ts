import { createExternalStore } from './store/externalStore';
import { findPalletType, PALLET_CATALOG, type PalletType } from './engine/palletCatalog';
import type { PalletTypeEvaluation } from './engine/palletRecommendation';

export const PALLET_TYPE_SELECTION_KEY = 'container-loading:pallet-type-selection';
export const AUTO_PALLET_TYPE = 'auto';
const FALLBACK_TYPE_ID = 'company-default';

export type PalletTypeSelectionState = {
  /** `auto` follows the recommendation; otherwise a catalog id the operator chose. */
  selected: string;
  recommendedId: string | null;
  /** Signature of the cargo/container/strategy the evaluations belong to. */
  signature: string | null;
  evaluations: PalletTypeEvaluation[];
  status: 'idle' | 'running' | 'done' | 'error';
};

const store = createExternalStore<PalletTypeSelectionState>({
  selected: AUTO_PALLET_TYPE, recommendedId: null, signature: null, evaluations: [], status: 'idle',
});
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const saved = window.localStorage.getItem(PALLET_TYPE_SELECTION_KEY);
    if (saved && (saved === AUTO_PALLET_TYPE || findPalletType(saved))) store.setSnapshot(current => ({ ...current, selected: saved }));
  } catch { /* selection falls back to auto */ }
}

export function readPalletTypeSelection() { hydrate(); return store.getSnapshot(); }
export function subscribePalletTypeSelection(listener: () => void) { hydrate(); return store.subscribe(listener); }
export function usePalletTypeSelection() { hydrate(); return store.useSnapshot(); }

export function choosePalletType(selected: string) {
  if (selected !== AUTO_PALLET_TYPE && !findPalletType(selected)) return;
  hydrate();
  store.setSnapshot(current => ({ ...current, selected }));
  try { window.localStorage.setItem(PALLET_TYPE_SELECTION_KEY, selected); } catch { /* optional */ }
}

export function startPalletRecommendation(signature: string) {
  store.setSnapshot(current => current.signature === signature && current.status !== 'error'
    ? current
    : { ...current, signature, evaluations: [], recommendedId: null, status: 'running' });
}

export function recordPalletEvaluation(signature: string, evaluation: PalletTypeEvaluation) {
  store.setSnapshot(current => current.signature !== signature ? current
    : { ...current, evaluations: [...current.evaluations.filter(e => e.typeId !== evaluation.typeId), evaluation] });
}

export function finishPalletRecommendation(signature: string, recommendedId: string | null, failed = false) {
  store.setSnapshot(current => current.signature !== signature ? current
    : { ...current, recommendedId, status: failed ? 'error' : 'done' });
}

/** The pallet the loader will actually use. */
export function resolvePalletType(state: PalletTypeSelectionState = readPalletTypeSelection()): PalletType {
  const id = state.selected === AUTO_PALLET_TYPE ? state.recommendedId ?? FALLBACK_TYPE_ID : state.selected;
  return findPalletType(id) ?? PALLET_CATALOG[0];
}
