import { useEffect, useState } from 'react';
import { assessGroupMove, selectPlacementGroup, type GroupSelectionMode } from './engine/groupPlacement';
import { writeManualOverride } from './engine/manualOverride';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  GROUP_DRAG_APPLY_EVENT,
  GROUP_DRAG_CANDIDATE_EVENT,
  GROUP_DRAG_FEEDBACK_EVENT,
  publishGroupSelection,
  type GroupDragDetail,
  type GroupDragFeedbackDetail,
} from './groupDragEvents';
import { PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { writeStoredState } from './storage';

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: Detail };

function modeFromButton(target: EventTarget | null): GroupSelectionMode | null | undefined {
  const button = target instanceof Element ? target.closest('.manual-group-picker button') : null;
  if (!button) return undefined;
  const text = button.textContent?.trim();
  if (text === '같은 품목') return 'cargo';
  if (text === '같은 행') return 'row';
  if (text === '같은 층') return 'layer';
  return undefined;
}

export default function GroupDragController() {
  const [detail, setDetail] = useState<Detail | null>(() => typeof window === 'undefined' ? null : ((window as LoadingWindow).__containerLoadingLatestResult ?? null));
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<GroupSelectionMode | null>(null);

  useEffect(() => {
    const onResult = (event: Event) => setDetail((event as CustomEvent<Detail>).detail ?? null);
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      setAnchorIndex(index);
      if (index === null) setMode(null);
    };
    const onClick = (event: MouseEvent) => {
      const next = modeFromButton(event.target);
      if (next === undefined) return;
      setMode(current => current === next ? null : next);
    };
    window.addEventListener(LOADING_RESULT_EVENT,onResult);
    window.addEventListener(PLACEMENT_SELECT_EVENT,onSelect);
    document.addEventListener('click',onClick,true);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT,onResult);
      window.removeEventListener(PLACEMENT_SELECT_EVENT,onSelect);
      document.removeEventListener('click',onClick,true);
    };
  },[]);

  useEffect(() => {
    const indices = detail && mode && anchorIndex !== null
      ? selectPlacementGroup(detail.result,detail.container,anchorIndex,mode)
      : [];
    publishGroupSelection({ mode, indices, anchorIndex });
  },[detail,mode,anchorIndex]);

  useEffect(() => {
    const onCandidate = (event: Event) => {
      const drag = (event as CustomEvent<GroupDragDetail>).detail;
      if (!drag || !detail) return;
      const checked = assessGroupMove(detail.container,detail.cargo,detail.result,drag.indices,drag.delta);
      const feedback: GroupDragFeedbackDetail = { ...drag, valid: checked.valid, reasons: checked.reasons };
      window.dispatchEvent(new CustomEvent<GroupDragFeedbackDetail>(GROUP_DRAG_FEEDBACK_EVENT,{detail:feedback}));
    };
    const onApply = (event: Event) => {
      const drag = (event as CustomEvent<GroupDragDetail>).detail;
      if (!drag || !detail) return;
      const checked = assessGroupMove(detail.container,detail.cargo,detail.result,drag.indices,drag.delta);
      if (!checked.valid) return;
      writeManualOverride(detail.container,detail.cargo,checked.result);
      writeStoredState({container:detail.container,cargo:detail.cargo},true);
    };
    window.addEventListener(GROUP_DRAG_CANDIDATE_EVENT,onCandidate);
    window.addEventListener(GROUP_DRAG_APPLY_EVENT,onApply);
    return () => {
      window.removeEventListener(GROUP_DRAG_CANDIDATE_EVENT,onCandidate);
      window.removeEventListener(GROUP_DRAG_APPLY_EVENT,onApply);
    };
  },[detail]);

  return null;
}
