import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeErgonomics, DEFAULT_ERGONOMIC_SETTINGS, type ErgonomicSettings } from './engine/ergonomics';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { selectPlacement } from './selectionEvents';

type Detail={container:ContainerSpec;cargo:CargoItem[];result:LoadingResult};
type LoadingWindow=Window&{__containerLoadingLatestResult?:Detail};
const KEY='container-loading-ergonomic-settings-v1';

function readSettings():ErgonomicSettings{
  try{return {...DEFAULT_ERGONOMIC_SETTINGS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return DEFAULT_ERGONOMIC_SETTINGS}
}

export default function ErgonomicRiskPanel(){
  const [target,setTarget]=useState<Element|null>(null);
  const [detail,setDetail]=useState<Detail|null>(()=>typeof window==='undefined'?null:((window as LoadingWindow).__containerLoadingLatestResult??null));
  const [settings,setSettings]=useState<ErgonomicSettings>(()=>typeof window==='undefined'?DEFAULT_ERGONOMIC_SETTINGS:readSettings());
  useEffect(()=>{
    const resolve=()=>setTarget(document.querySelector('.viewer-card'));
    resolve();const observer=new MutationObserver(resolve);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const onResult=(e:Event)=>setDetail((e as CustomEvent<Detail>).detail??null);window.addEventListener(LOADING_RESULT_EVENT,onResult);return()=>window.removeEventListener(LOADING_RESULT_EVENT,onResult)},[]);
  useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(settings))},[settings]);
  const risks=useMemo(()=>detail?analyzeErgonomics(detail.result,settings):[],[detail,settings]);
  const high=risks.filter(r=>r.level==='high').length;
  if(!target||!detail)return null;
  return createPortal(<section className="ergonomic-panel">
    <div className="ergonomic-head"><div><b>작업자 취급 위험 점검</b><span>현장 기준값을 직접 설정합니다.</span></div><strong className={high?'danger':risks.length?'warn':'ok'}>{high?`고위험 ${high}`:risks.length?`확인 ${risks.length}`:'양호'}</strong></div>
    <div className="ergonomic-settings"><label>편안한 도달 높이(m)<input type="number" min="0.5" step="0.05" value={settings.comfortableReachM} onChange={e=>setSettings(s=>({...s,comfortableReachM:Math.max(.5,Number(e.target.value)||2)}))}/></label><label>수동 취급 기준(kg)<input type="number" min="1" step="1" value={settings.manualHandlingKg} onChange={e=>setSettings(s=>({...s,manualHandlingKg:Math.max(1,Number(e.target.value)||15)}))}/></label></div>
    {risks.length===0?<div className="ergonomic-empty">현재 설정 기준으로 높이·중량 취급 위험이 감지되지 않았습니다.</div>:<div className="ergonomic-list">{risks.slice(0,8).map(r=><button key={r.placementIndex} className={r.level} onClick={()=>selectPlacement(r.placementIndex)}><div><b>{r.cargoId} · #{r.placementIndex+1}</b><span>상단 {r.topM.toFixed(2)}m · {r.weightKg.toFixed(1)}kg</span></div><small>{r.reasons.join(' / ')}</small></button>)}</div>}
    <p>이 점검은 사용자가 입력한 현장 기준에 따른 작업 보조용 표시이며 법적·인체공학적 적합성 판정을 대신하지 않습니다.</p>
  </section>,target);
}
