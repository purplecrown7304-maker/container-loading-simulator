import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { assessManualMove, supportsOtherPlacement } from './engine/manualPlacement';
import { assessGroupMove, selectPlacementGroup, type GroupSelectionMode } from './engine/groupPlacement';
import { clearManualOverride, writeManualOverride } from './engine/manualOverride';
import { findBestSmartSnap, type SmartSnapReason } from './engine/smartSnap';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  MANUAL_DRAG_APPLY_EVENT,
  MANUAL_DRAG_CANDIDATE_EVENT,
  MANUAL_DRAG_FEEDBACK_EVENT,
  type ManualDragCandidateDetail,
  type ManualDragFeedbackDetail,
} from './manualDragEvents';
import { PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { writeStoredState } from './storage';

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: Detail };
type Target = { x:number; y:number; z:number };

const zeroDelta: Target = { x:0, y:0, z:0 };

export default function ManualPlacementEditor() {
  const [target, setTarget] = useState<Element | null>(null);
  const [detail, setDetail] = useState<Detail | null>(() => typeof window === 'undefined' ? null : ((window as LoadingWindow).__containerLoadingLatestResult ?? null));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [position, setPosition] = useState<Target>(zeroDelta);
  const [rotate, setRotate] = useState(false);
  const [history, setHistory] = useState<LoadingResult[]>([]);
  const [message, setMessage] = useState('');
  const [snapReason, setSnapReason] = useState<SmartSnapReason | null>(null);
  const [groupMode, setGroupMode] = useState<GroupSelectionMode | null>(null);
  const [groupDelta, setGroupDelta] = useState<Target>(zeroDelta);

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector('.viewer-card'));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body,{childList:true,subtree:true});
    return () => observer.disconnect();
  },[]);

  useEffect(() => {
    const onResult = (event: Event) => setDetail((event as CustomEvent<Detail>).detail ?? null);
    window.addEventListener(LOADING_RESULT_EVENT,onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT,onResult);
  },[]);

  useEffect(() => {
    const onSelection = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      setSelectedIndex(index);
      const current = index === null ? undefined : detail?.result.placements[index];
      if (current) setPosition({x:current.x,y:current.y,z:current.z});
      setRotate(false); setMessage(''); setSnapReason(null); setGroupMode(null); setGroupDelta(zeroDelta);
    };
    window.addEventListener(PLACEMENT_SELECT_EVENT,onSelection);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT,onSelection);
  },[detail]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const current = detail?.result.placements[selectedIndex];
    if (current && !groupMode) setPosition({x:current.x,y:current.y,z:current.z});
  },[detail,selectedIndex,groupMode]);

  useEffect(() => {
    const onCandidate = (event: Event) => {
      const drag = (event as CustomEvent<ManualDragCandidateDetail>).detail;
      if (!drag || !detail) return;
      setGroupMode(null); setGroupDelta(zeroDelta);
      setSelectedIndex(drag.index);
      setRotate(false);
      const snap = findBestSmartSnap(detail.container, detail.cargo, detail.result, drag.index, drag.position, false);
      if (snap) {
        setPosition(snap.position);
        setSnapReason(snap.reason);
        setMessage(snap.reason === '드래그 위치' ? '3D 드래그 위치를 검사 중입니다.' : `${snap.reason} 후보로 자동 스냅했습니다.`);
      } else {
        setPosition(drag.position);
        setSnapReason(null);
        setMessage('주변에 안전한 스마트 스냅 후보가 없어 원래 위치를 검사합니다.');
      }
    };
    window.addEventListener(MANUAL_DRAG_CANDIDATE_EVENT,onCandidate);
    return () => window.removeEventListener(MANUAL_DRAG_CANDIDATE_EVENT,onCandidate);
  },[detail]);

  const selected = selectedIndex === null ? undefined : detail?.result.placements[selectedIndex];
  const locked = selectedIndex !== null && detail ? supportsOtherPlacement(selectedIndex,detail.result.placements) : false;
  const assessment = useMemo(() => {
    if (groupMode || !detail || selectedIndex === null || !selected) return null;
    try { return assessManualMove(detail.container,detail.cargo,detail.result,selectedIndex,position,rotate); }
    catch { return null; }
  },[groupMode,detail,selectedIndex,selected,position,rotate]);

  const groupIndices = useMemo(() => {
    if (!groupMode || !detail || selectedIndex === null) return [];
    return selectPlacementGroup(detail.result, detail.container, selectedIndex, groupMode);
  },[groupMode,detail,selectedIndex]);

  const groupAssessment = useMemo(() => {
    if (!groupMode || !detail || groupIndices.length === 0) return null;
    try { return assessGroupMove(detail.container, detail.cargo, detail.result, groupIndices, groupDelta); }
    catch { return null; }
  },[groupMode,detail,groupIndices,groupDelta]);

  useEffect(() => {
    if (selectedIndex === null || !assessment || groupMode) return;
    const feedback: ManualDragFeedbackDetail = {
      index: selectedIndex,
      position,
      valid: assessment.valid && !locked,
      reasons: locked ? ['위 화물을 지지하는 박스는 먼저 이동할 수 없습니다.'] : assessment.reasons,
    };
    window.dispatchEvent(new CustomEvent<ManualDragFeedbackDetail>(MANUAL_DRAG_FEEDBACK_EVENT,{detail:feedback}));
  },[assessment,selectedIndex,position,locked,groupMode]);

  useEffect(() => {
    const onApplyDrag = (event: Event) => {
      const drag = (event as CustomEvent<ManualDragCandidateDetail>).detail;
      if (!drag || !detail) return;
      setGroupMode(null); setGroupDelta(zeroDelta);
      const current = detail.result.placements[drag.index];
      if (!current || supportsOtherPlacement(drag.index,detail.result.placements)) {
        setMessage('지지 중인 하부 박스라 드래그 이동할 수 없습니다.');
        return;
      }
      const snap = findBestSmartSnap(detail.container,detail.cargo,detail.result,drag.index,drag.position,false);
      const targetPosition = snap?.position ?? drag.position;
      const checked = assessManualMove(detail.container,detail.cargo,detail.result,drag.index,targetPosition,false);
      if (!checked.valid) {
        setMessage(checked.reasons[0] ?? '안전조건을 만족하지 않아 이동을 취소했습니다.');
        return;
      }
      setHistory(h => [...h.slice(-9),detail.result]);
      writeManualOverride(detail.container,detail.cargo,checked.result);
      writeStoredState({container:detail.container,cargo:detail.cargo},true);
      setSelectedIndex(drag.index);
      setPosition(targetPosition);
      setSnapReason(snap?.reason ?? null);
      setMessage(snap && snap.reason !== '드래그 위치' ? `${snap.reason} 위치로 스마트 스냅 이동을 적용했습니다.` : '3D 드래그 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.');
    };
    window.addEventListener(MANUAL_DRAG_APPLY_EVENT,onApplyDrag);
    return () => window.removeEventListener(MANUAL_DRAG_APPLY_EVENT,onApplyDrag);
  },[detail]);

  const nudge = (axis: keyof Target, delta: number) => { setSnapReason(null); setPosition(p => ({...p,[axis]:Math.max(0,p[axis]+delta)})); };
  const nudgeGroup = (axis: keyof Target, delta: number) => setGroupDelta(p => ({...p,[axis]:Number((p[axis]+delta).toFixed(2))}));
  const apply = () => {
    if (!detail || !assessment?.valid) return;
    setHistory(h => [...h.slice(-9),detail.result]);
    writeManualOverride(detail.container,detail.cargo,assessment.result);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
    setMessage('수동 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.');
  };
  const applyGroup = () => {
    if (!detail || !groupAssessment?.valid || groupIndices.length === 0) return;
    setHistory(h => [...h.slice(-9),detail.result]);
    writeManualOverride(detail.container,detail.cargo,groupAssessment.result);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
    setGroupDelta(zeroDelta);
    setMessage(`${groupIndices.length}개 박스 블록 이동을 적용했습니다. 모든 분석값을 다시 계산했습니다.`);
  };
  const undo = () => {
    if (!detail || history.length === 0) return;
    const previous = history[history.length-1];
    setHistory(h => h.slice(0,-1));
    writeManualOverride(detail.container,detail.cargo,previous);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
    setSnapReason(null); setGroupDelta(zeroDelta);
    setMessage('마지막 수동 이동을 취소했습니다.');
  };
  const reset = () => {
    if (!detail) return;
    clearManualOverride(); setHistory([]); setSnapReason(null); setGroupMode(null); setGroupDelta(zeroDelta);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
    setMessage('수동 편집을 지우고 자동 적재 결과로 복귀했습니다.');
  };
  const chooseGroup = (mode: GroupSelectionMode) => {
    setGroupMode(current => current === mode ? null : mode);
    setGroupDelta(zeroDelta); setRotate(false); setSnapReason(null); setMessage('');
  };

  if (!target) return null;
  return createPortal(<div className={`manual-editor ${selected ? 'open' : ''}`}>
    <div className="manual-editor-head"><div><b>수동 적재 편집</b><span>{selected ? `${selected.cargoId} · #${(selectedIndex ?? 0)+1}` : '3D에서 박스를 선택하세요'}</span></div><div><button disabled={!history.length} onClick={undo}>↶ 실행취소</button><button onClick={reset}>자동배치 복귀</button></div></div>
    {selected && detail && <>
      <div className="manual-group-picker">
        <span>묶음 선택</span>
        <button className={groupMode==='cargo'?'active':''} onClick={()=>chooseGroup('cargo')}>같은 품목</button>
        <button className={groupMode==='row'?'active':''} onClick={()=>chooseGroup('row')}>같은 행</button>
        <button className={groupMode==='layer'?'active':''} onClick={()=>chooseGroup('layer')}>같은 층</button>
        {groupMode && <b>{groupIndices.length}개 선택</b>}
      </div>

      {groupMode ? <>
        <div className="manual-group-note">선택된 박스의 상대 위치를 유지한 채 블록 전체를 이동합니다. 다른 박스를 받치고 있으면 이동이 차단됩니다.</div>
        <div className="manual-controls group">
          {(['x','y','z'] as const).map(axis => <div className="manual-axis" key={axis}><b>Δ{axis.toUpperCase()}</b><button onClick={()=>nudgeGroup(axis,-0.05)}>−5cm</button><input type="number" step="0.05" value={groupDelta[axis].toFixed(2)} onChange={e=>setGroupDelta(p=>({...p,[axis]:Number(e.target.value)||0}))}/><button onClick={()=>nudgeGroup(axis,0.05)}>+5cm</button></div>)}
        </div>
        <div className={`manual-assessment ${groupAssessment?.valid ? 'valid' : 'invalid'}`}>
          <div className="manual-status"><b>{groupAssessment?.valid ? `✓ ${groupIndices.length}개 블록 이동 가능` : '✕ 블록 이동 불가'}</b><span>상대 위치 유지 · 5cm 스냅 · 전체 안전검사</span></div>
          {!groupAssessment?.valid && <div className="manual-reasons">{groupAssessment?.reasons.slice(0,5).map((reason,i)=><span key={i}>{reason}</span>)}</div>}
          {groupAssessment && <div className="manual-metrics"><span>품질점수 <b>{groupAssessment.before.quality.toFixed(0)} → {groupAssessment.after.quality.toFixed(0)}</b></span><span>최대 바닥하중 <b>{groupAssessment.before.maxFloorLoadKgPerM2.toFixed(0)} → {groupAssessment.after.maxFloorLoadKgPerM2.toFixed(0)} kg/m²</b></span><span>무게중심 X <b>{groupAssessment.before.centerX.toFixed(2)} → {groupAssessment.after.centerX.toFixed(2)}m</b></span></div>}
        </div>
        <button className="manual-apply" disabled={!groupAssessment?.valid || groupIndices.length===0} onClick={applyGroup}>선택 블록 이동 적용</button>
      </> : <>
        {locked && <div className="manual-lock">🔒 위 화물을 지지하는 박스입니다. 상부 박스를 먼저 이동하세요.</div>}
        {snapReason && snapReason !== '드래그 위치' && <div className="manual-smart-snap">✦ 스마트 스냅 · {snapReason}</div>}
        <div className="manual-controls">
          {(['x','y','z'] as const).map(axis => <div className="manual-axis" key={axis}><b>{axis.toUpperCase()}</b><button onClick={()=>nudge(axis,-0.05)}>−5cm</button><input type="number" step="0.05" value={position[axis].toFixed(2)} onChange={e=>{setSnapReason(null);setPosition(p=>({...p,[axis]:Math.max(0,Number(e.target.value)||0)}));}}/><button onClick={()=>nudge(axis,0.05)}>+5cm</button></div>)}
          <label className="manual-rotate"><input type="checkbox" checked={rotate} onChange={e=>{setSnapReason(null);setRotate(e.target.checked);}} disabled={detail.cargo.find(c=>c.id===selected.cargoId)?.allowRotation===false}/><span>90° 회전</span></label>
        </div>
        <div className={`manual-assessment ${assessment?.valid ? 'valid' : 'invalid'}`}>
          <div className="manual-status"><b>{assessment?.valid ? '✓ 이동 가능' : '✕ 이동 불가'}</b><span>5cm 스냅 · 스마트 스냅 · 실시간 안전검사</span></div>
          {!assessment?.valid && <div className="manual-reasons">{assessment?.reasons.map((reason,i)=><span key={i}>{reason}</span>)}</div>}
          {assessment && <div className="manual-metrics"><span>품질점수 <b>{assessment.before.quality.toFixed(0)} → {assessment.after.quality.toFixed(0)}</b></span><span>최대 바닥하중 <b>{assessment.before.maxFloorLoadKgPerM2.toFixed(0)} → {assessment.after.maxFloorLoadKgPerM2.toFixed(0)} kg/m²</b></span><span>무게중심 X <b>{assessment.before.center.x.toFixed(2)} → {assessment.after.center.x.toFixed(2)}m</b></span></div>}
        </div>
        <button className="manual-apply" disabled={!assessment?.valid || locked} onClick={apply}>이 위치로 이동 적용</button>
      </>}
      {message && <div className="manual-message">{message}</div>}
    </>}
  </div>,target);
}
