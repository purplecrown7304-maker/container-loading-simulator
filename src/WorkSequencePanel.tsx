import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildWorkSequence } from './engine/workSequence';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { selectPlacement } from './selectionEvents';

type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: Detail };

function progressKey(detail:Detail,mode:'LOAD'|'UNLOAD'){
  const fp=detail.result.placements.map(p=>`${p.cargoId}:${p.x},${p.y},${p.z}`).join('|');
  return `container-loading-work-progress:${mode}:${fp}`;
}
function readCompleted(key:string):number[]{
  try{return JSON.parse(sessionStorage.getItem(key)||'[]') as number[]}catch{return []}
}

export default function WorkSequencePanel(){
  const [target,setTarget]=useState<Element|null>(null);
  const [detail,setDetail]=useState<Detail|null>(()=>typeof window==='undefined'?null:((window as LoadingWindow).__containerLoadingLatestResult??null));
  const [mode,setMode]=useState<'LOAD'|'UNLOAD'>('LOAD');
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [completed,setCompleted]=useState<Set<number>>(new Set());

  useEffect(()=>{
    const resolve=()=>setTarget(document.querySelector('.viewer-card'));
    resolve(); const observer=new MutationObserver(resolve); observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const onResult=(event:Event)=>{setDetail((event as CustomEvent<Detail>).detail??null);setIndex(0);setPlaying(false)};
    window.addEventListener(LOADING_RESULT_EVENT,onResult); return()=>window.removeEventListener(LOADING_RESULT_EVENT,onResult);
  },[]);
  const steps=useMemo(()=>detail?buildWorkSequence(detail.container,detail.cargo,detail.result,mode):[],[detail,mode]);
  const key=useMemo(()=>detail?progressKey(detail,mode):'',[detail,mode]);
  useEffect(()=>{setCompleted(new Set(key?readCompleted(key):[]));setIndex(0);setPlaying(false)},[key]);
  const safeIndex=Math.min(index,Math.max(0,steps.length-1));
  const current=steps[safeIndex];
  useEffect(()=>{ if(current) selectPlacement(current.placementIndex); },[current?.placementIndex]);
  useEffect(()=>{
    if(!playing||steps.length<2)return;
    const timer=window.setInterval(()=>setIndex(i=>{
      if(i>=steps.length-1){setPlaying(false);return i}
      return i+1;
    }),Math.max(250,1200/speed));
    return()=>window.clearInterval(timer);
  },[playing,speed,steps.length]);
  const toggleComplete=()=>{
    if(!current||!key)return;
    setCompleted(prev=>{
      const next=new Set(prev);
      if(next.has(current.step))next.delete(current.step);else next.add(current.step);
      sessionStorage.setItem(key,JSON.stringify([...next]));
      return next;
    });
  };
  const resetProgress=()=>{if(key)sessionStorage.removeItem(key);setCompleted(new Set())};
  if(!target||!detail||steps.length===0)return null;
  const pct=steps.length<=1?100:((safeIndex+1)/steps.length)*100;
  const donePct=(completed.size/steps.length)*100;
  return createPortal(<section className="work-sequence">
    <div className="work-sequence-head"><div><b>작업 순서 시뮬레이션</b><span>{mode==='LOAD'?'실제 적재 순서':'실제 하역 순서'} · {steps.length}단계</span></div><div className="work-mode"><button className={mode==='LOAD'?'active':''} onClick={()=>setMode('LOAD')}>적재</button><button className={mode==='UNLOAD'?'active':''} onClick={()=>setMode('UNLOAD')}>하역</button></div></div>
    <div className="work-progress"><i style={{width:`${pct}%`}}/></div>
    <div className="work-check-progress"><span>현장 완료 {completed.size}/{steps.length}</span><div><i style={{width:`${donePct}%`}}/></div><button onClick={resetProgress}>체크 초기화</button></div>
    <div className="work-current"><strong>{safeIndex+1} / {steps.length}</strong><div><b>{current.cargoId} · {current.label}</b><span>{current.instruction}</span>{current.unloadPriority!==undefined&&<small>하역 우선순위 {current.unloadPriority}</small>}</div><button className={completed.has(current.step)?'checked':''} onClick={toggleComplete}>{completed.has(current.step)?'✓ 완료됨':'완료 체크'}</button></div>
    <div className="work-controls"><button onClick={()=>setIndex(0)}>처음</button><button onClick={()=>setIndex(i=>Math.max(0,i-1))}>이전</button><button className="play" onClick={()=>setPlaying(v=>!v)}>{playing?'일시정지':'▶ 재생'}</button><button onClick={()=>setIndex(i=>Math.min(steps.length-1,i+1))}>다음</button><select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></div>
    <div className="work-strip">{steps.slice(Math.max(0,safeIndex-2),Math.min(steps.length,safeIndex+3)).map(step=><button key={`${mode}-${step.step}`} className={`${step.step===safeIndex+1?'active ':''}${completed.has(step.step)?'done':''}`} onClick={()=>setIndex(step.step-1)}><b>{completed.has(step.step)?'✓':step.step}</b><span>{step.cargoId}</span><small>L{step.layer}</small></button>)}</div>
  </section>,target);
}
