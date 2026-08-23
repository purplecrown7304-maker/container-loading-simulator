import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [history, setHistory] = useState<LoadingResult[]>([]);
  const [undoTarget, setUndoTarget] = useState<Element | null>(null);

  useEffect(() => {
    const resolve = () => setUndoTarget(document.querySelector('.manual-editor-head > div:last-child'));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body,{childList:true,subtree:true});
    return () => observer.disconnect();
  },[]);

  useEffect(() => {
    const onResult = (event: Event) => setDetail((event as CustomEvent<Detail>).detail ?? null);
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      setAnchorIndex(previous => {
        if (previous !== null && index !== previous) setMode(null);
        return index;
      });
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
    const indices = detail && mode && anchorIndex !== null ? selectPlacementGroup(detail.result,detail.container,anchorIndex,mode) : [];
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
      setHistory(items => [...items.slice(-9),detail.result]);
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

  const undoGroupDrag = () => {
    if (!detail || history.length === 0) return;
    const previous = history[history.length-1];
    setHistory(items => items.slice(0,-1));
    writeManualOverride(detail.container,detail.cargo,previous);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
  };

  return undoTarget && history.length > 0
    ? createPortal(<button type="button" className="group-drag-undo" onClick={undoGroupDrag}>↶ 블록 드래그 취소</button>,undoTarget)
    : null;
}
