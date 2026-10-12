import { uiWorkflowText } from './workflowPresentation';
import { uiText, useUiLanguage } from './uiLanguage';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { assessGroupMove, selectPlacementGroup, type GroupSelectionMode } from './engine/groupPlacement';
import { suggestGroupMoves } from './engine/groupMoveSuggestions';
import { writeManualOverride } from './engine/manualOverride';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { writeStoredState } from './storage';

type Detail={container:ContainerSpec;cargo:CargoItem[];result:LoadingResult};
type LoadingWindow=Window&{__containerLoadingLatestResult?:Detail};

const labels:Record<GroupSelectionMode,string>={cargo:'같은 품목',row:'같은 행',layer:'같은 층'};

export default function GroupMoveSuggestionPanel(){
  useUiLanguage();
  const [target,setTarget]=useState<Element|null>(null);
  const [detail,setDetail]=useState<Detail|null>(()=>typeof window==='undefined'?null:((window as LoadingWindow).__containerLoadingLatestResult??null));
  const [selectedIndex,setSelectedIndex]=useState<number|null>(null);
  const [mode,setMode]=useState<GroupSelectionMode>('cargo');
  const [message,setMessage]=useState('');

  useEffect(()=>{const resolve=()=>setTarget(document.querySelector('.viewer-card'));resolve();const o=new MutationObserver(resolve);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();},[]);
  useEffect(()=>{const fn=(e:Event)=>setDetail((e as CustomEvent<Detail>).detail??null);window.addEventListener(LOADING_RESULT_EVENT,fn);return()=>window.removeEventListener(LOADING_RESULT_EVENT,fn);},[]);
  useEffect(()=>{const fn=(e:Event)=>{setSelectedIndex((e as CustomEvent<PlacementSelectDetail>).detail?.index??null);setMessage('');};window.addEventListener(PLACEMENT_SELECT_EVENT,fn);return()=>window.removeEventListener(PLACEMENT_SELECT_EVENT,fn);},[]);

  const indices=useMemo(()=>!detail||selectedIndex===null?[]:selectPlacementGroup(detail.result,detail.container,selectedIndex,mode),[detail,selectedIndex,mode]);
  const suggestions=useMemo(()=>!detail||!indices.length?[]:suggestGroupMoves(detail.container,detail.cargo,detail.result,indices,{x:0,y:0,z:0},3),[detail,indices]);

  const apply=(delta:{x:number;y:number;z:number})=>{
    if(!detail||!indices.length)return;
    const checked=assessGroupMove(detail.container,detail.cargo,detail.result,indices,delta);
    if(!checked.valid){setMessage(checked.reasons[0]??'안전조건을 만족하지 않습니다.');return;}
    writeManualOverride(detail.container,detail.cargo,checked.result);
    writeStoredState({container:detail.container,cargo:detail.cargo},true);
    setMessage(`${indices.length}개 블록을 추천 위치로 이동했습니다.`);
  };

  if(!target)return null;
  return createPortal(<section className="group-suggestion-panel">
    <div className="group-suggestion-head"><div><b>{uiText("블록 추천 이동")}</b><span>{uiText("안전한 빈 공간 후보 TOP 3")}</span></div><div className="group-suggestion-tabs">{(['cargo','row','layer'] as GroupSelectionMode[]).map(m=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{uiText(labels[m])}</button>)}</div></div>
    {selectedIndex===null?<div className="group-suggestion-empty">{uiText("3D에서 기준 박스를 선택하면 블록 이동 후보를 계산합니다.")}</div>:<>
      <div className="group-suggestion-summary"><b>{uiText("{0} · {1}개", [uiText(labels[mode]), indices.length])}</b><span>{uiText("상대 위치 유지 · 충돌/지지/적층/하중 검증")}</span></div>
      {suggestions.length?<div className="group-suggestion-grid">{suggestions.map((s,i)=><button key={`${s.delta.x}-${s.delta.y}-${s.delta.z}`} className="group-suggestion-card" onClick={()=>apply(s.delta)}>
        <strong>#{i+1} {uiText(s.label)}</strong>
        <span>ΔX {s.delta.x.toFixed(2)} · ΔY {s.delta.y.toFixed(2)} · ΔZ {s.delta.z.toFixed(2)}m</span>
        <small>{uiText("품질 {0}점 · 최대 {1} kg/m² · 중심X {2}m", [s.quality.toFixed(0), s.maxFloorLoadKgPerM2.toFixed(0), s.centerX.toFixed(2)])}</small>
        <em>{uiText("이 위치 적용")}</em>
      </button>)}</div>:<div className="group-suggestion-empty warn">{uiText("현재 블록을 안전하게 통째로 옮길 후보를 찾지 못했습니다.")}</div>}
      {message&&<div className="group-suggestion-message">{uiWorkflowText(message)}</div>}
    </>}
  </section>,target);
}
