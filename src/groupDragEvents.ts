import type { GroupSelectionMode } from './engine/groupPlacement';

export const GROUP_SELECTION_EVENT = 'container-loading:group-selection';
export const GROUP_DRAG_CANDIDATE_EVENT = 'container-loading:group-drag-candidate';
export const GROUP_DRAG_FEEDBACK_EVENT = 'container-loading:group-drag-feedback';
export const GROUP_DRAG_APPLY_EVENT = 'container-loading:group-drag-apply';

export type GroupSelectionDetail = {
  mode: GroupSelectionMode | null;
  indices: number[];
  anchorIndex: number | null;
};

export type GroupDragDetail = {
  indices: number[];
  anchorIndex: number;
  delta: { x:number; y:number; z:number };
};

export type GroupDragFeedbackDetail = GroupDragDetail & {
  valid: boolean;
  reasons: string[];
};

export function publishGroupSelection(detail: GroupSelectionDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GroupSelectionDetail>(GROUP_SELECTION_EVENT,{detail}));
}

export function publishGroupDragCandidate(detail: GroupDragDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GroupDragDetail>(GROUP_DRAG_CANDIDATE_EVENT,{detail}));
}

export function publishGroupDragApply(detail: GroupDragDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GroupDragDetail>(GROUP_DRAG_APPLY_EVENT,{detail}));
}
