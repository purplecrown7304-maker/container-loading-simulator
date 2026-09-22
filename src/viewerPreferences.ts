export type PreviewView = 'free' | 'rear' | 'top' | 'side';

// v2 intentionally resets stale OFF preferences from older releases so that
// labels are visible after the four-face sticker fix. Users can still toggle
// them off and the new preference will persist normally.
export const BOX_LABEL_STORAGE_KEY = 'container-loading-show-box-labels-v2';
export const WEIGHT_GRAPH_STORAGE_KEY = 'container-loading-show-weight-graph-v1';
export const WEIGHT_CG_STORAGE_KEY = 'container-loading-show-weight-cg-v1';

export function readBoxLabelPreference(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(BOX_LABEL_STORAGE_KEY) !== 'false';
}

export function saveBoxLabelPreference(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOX_LABEL_STORAGE_KEY, String(value));
}

export function readWeightGraphPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(WEIGHT_GRAPH_STORAGE_KEY) === 'true';
}

export function saveWeightGraphPreference(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WEIGHT_GRAPH_STORAGE_KEY, String(value));
}

export function readWeightCgPreference(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(WEIGHT_CG_STORAGE_KEY) !== 'false';
}

export function saveWeightCgPreference(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WEIGHT_CG_STORAGE_KEY, String(value));
}
