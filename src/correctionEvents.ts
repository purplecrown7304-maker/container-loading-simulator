import type { AutoCorrectionRecord } from './engine/types';

export const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';

export function publishAutoCorrections(corrections: AutoCorrectionRecord[]) {
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

export type AutoCorrectionEventDetail = { corrections: AutoCorrectionRecord[] };
