export const MANUAL_DRAG_CANDIDATE_EVENT = 'container-loading:manual-drag-candidate';
export const MANUAL_DRAG_FEEDBACK_EVENT = 'container-loading:manual-drag-feedback';
export const MANUAL_DRAG_APPLY_EVENT = 'container-loading:manual-drag-apply';
export const MANUAL_DRAG_CANCEL_EVENT = 'container-loading:manual-drag-cancel';

export type ManualDragCandidateDetail = {
  index: number;
  position: { x: number; y: number; z: number };
};

export type ManualDragFeedbackDetail = {
  index: number;
  position: { x: number; y: number; z: number };
  valid: boolean;
  reasons: string[];
};

export function publishManualDragCandidate(detail: ManualDragCandidateDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ManualDragCandidateDetail>(MANUAL_DRAG_CANDIDATE_EVENT, { detail }));
}

export function publishManualDragApply(detail: ManualDragCandidateDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ManualDragCandidateDetail>(MANUAL_DRAG_APPLY_EVENT, { detail }));
}

export function publishManualDragCancel() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MANUAL_DRAG_CANCEL_EVENT));
}
