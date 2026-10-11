import { uiText as uiT, useUiLanguage } from './uiLanguage';
import { useEffect, useRef, useState } from 'react';
import type { CargoItem, ContainerSpec } from './engine/types';
import type { LoadingStrategy } from './engine/loadingEngine';
import type { ForecastInput, LoadingForecast } from './engine/loadingForecast';
import { palletJobSpec, usePalletJobSpecs } from './palletJobSpecs';
import { useTransportEquipment } from './transportEquipment';
import { publishGuidedLoadingUnit, useGuidedLoadingUnit, type GuidedLoadingUnit } from './guidedLoadingUnitState';
import { resolvePalletType, usePalletTypeSelection } from './palletTypeSelection';
import { writeStoredState, type StoredState } from './storage';
import GuidedPalletTypePicker from './GuidedPalletTypePicker';
import CargoStackRestrictionNotice from './CargoStackRestrictionNotice';
import { loadingMethodBlockReason } from './loadingMethodReadiness';
import { addIncompatiblePair, addRecommendedPairs, normalizeIncompatiblePairs, removeIncompatiblePair, segregationPreview, SEGREGATION_CLASSES, TEMP_ZONES } from './segregationSettings';

const objectives = [
  { id:'stability' as const, title:'안정성 우선', detail:'무거운 화물을 낮게 두고 좌우·전후 균형을 맞춥니다.' },
  { id:'capacity' as const, title:'공간효율 우선', detail:'빈 공간과 미적재를 줄입니다.' },
];
const modes: Array<{ id:GuidedLoadingUnit; title:string; detail:string }> = [
  { id:'boxes',title:'박스 직접 적재',detail:'포장된 박스를 적재 공간 바닥에 직접 배치합니다.' },
  { id:'pallets',title:'파렛트 적재',detail:'박스를 팔레트에 구성한 뒤 팔레트 단위로 배치합니다.' },
  { id:'mixed',title:'혼합 적재',detail:'품목별로 팔레트·직접 적재를 지정하고 같은 공간에 배치합니다.' },
];

export default function LoadingMethodStage({ input, strategy, onStrategy, confirmed, active, onPackaging }: {
  input:StoredState; strategy:LoadingStrategy|null; onStrategy:(strategy:LoadingStrategy)=>void; confirmed:boolean; active:boolean; onPackaging:()=>void;
}) {
  useUiLanguage();
  const mode = useGuidedLoadingUnit() ?? 'boxes';
  useEffect(() => { document.documentElement.dataset.guidedLoadingUnit = mode; return () => { delete document.documentElement.dataset.guidedLoadingUnit; }; },[mode]);
  const palletSelection = usePalletTypeSelection();
  const equipment = useTransportEquipment();
  const jobSpecs = usePalletJobSpecs();
  const pallet = palletJobSpec(resolvePalletType(palletSelection), jobSpecs);
  const currentStrategy = strategy === 'unloading' ? 'capacity' : strategy;
  const reason = loadingMethodBlockReason(confirmed,currentStrategy,mode,input,palletSelection);
  const destination = input.container.palletDestination ?? { transport:'domestic',region:'europe',requiredSize:'' };
  const updateContainer = (change: Partial<ContainerSpec>) => writeStoredState({ ...input, container:{...input.container,...change} },true);
  useEffect(() => {
    if (active && input.container.unloadingPolicy === undefined) {
      writeStoredState({...input,container:{...input.container,unloadingPolicy:'strict'}},true);
    }
  },[active,input]);
  const updateDestination = (change: Partial<NonNullable<ContainerSpec['palletDestination']>>) => updateContainer({palletDestination:{...destination,...change}});
  const products = [...new Map(input.cargo.filter(i=>i.quantity>0).map(i=>[i.productId ?? i.id,i])).values()];
  const updateProduct = (item:CargoItem, change:Partial<CargoItem>) => writeStoredState({ ...input,
    container:{ ...input.container, unloadingPolicy:input.container.unloadingPolicy ?? 'strict' },
    cargo:input.cargo.map(i=>(i.productId ?? i.id)===(item.productId ?? item.id)?{...i,...change}:i) },true);
  const chooseMode = (next:GuidedLoadingUnit) => {
    if (next === 'mixed') writeStoredState({ ...input, cargo:input.cargo.map(i=>({...i,mixedLoadingMethod:i.mixedLoadingMethod ?? 'pallet'})) },true);
    publishGuidedLoadingUnit(next);
  };
  const stops = new Set(input.cargo.filter(i=>i.quantity>0).map(i=>i.unloadPriority ?? 1)).size;
  const incompatiblePairs = normalizeIncompatiblePairs(input.container.incompatiblePairs);
  const [pairDraft, setPairDraft] = useState<[string,string]>([SEGREGATION_CLASSES[1], SEGREGATION_CLASSES[2]]);
  const segregation = segregationPreview(input.container, input.cargo);
  const classifiedCount = products.filter(item=>item.segregationClass || item.tempZone).length;
  const strict = input.container.unloadingPolicy !== 'soft';
  const forecastInput:ForecastInput = { ...input, mode, pallet };
  const forecastKey = JSON.stringify(forecastInput);
  const [request, setRequest] = useState<{key:string;first:LoadingStrategy;version:number}|null>(null);
  const finishedRequest = useRef<typeof request>(null);
  const [comparison, setComparison] = useState<{key:string;results:LoadingForecast[];status:'running'|'done'|'error';error?:string}|null>(null);
  useEffect(() => {
    if (!active || !confirmed || !request || request.key !== forecastKey || finishedRequest.current === request) return;
    if (typeof Worker === 'undefined') { setComparison({key:forecastKey,results:[],status:'error',error:'이 브라우저에서는 백그라운드 계산을 사용할 수 없습니다.'}); return; }
    const worker = new Worker(new URL('./engine/loadingForecast.worker.ts',import.meta.url),{type:'module'});
    let cancelled=false;
    setComparison({key:forecastKey,results:[],status:'running'});
    worker.onmessage=(event:MessageEvent<{forecast?:LoadingForecast;done?:boolean;error?:string}>)=>{
      if(cancelled)return;
      if(event.data.forecast) setComparison(previous=>({key:forecastKey,results:[...(previous?.key===forecastKey?previous.results:[]),event.data.forecast!],status:'running'}));
      else { worker.terminate();if(event.data.done)finishedRequest.current=request;setComparison(previous=>({key:forecastKey,results:previous?.results??[],status:event.data.error?'error':'done',error:event.data.error})); }
    };
    worker.onerror=()=>{if(!cancelled)setComparison({key:forecastKey,results:[],status:'error',error:'예상 결과 계산에 실패했습니다.'});worker.terminate();};
    worker.postMessage({input:JSON.parse(forecastKey),first:request.first});
    return()=>{cancelled=true;worker.terminate();};
  },[active,confirmed,request,forecastKey]);
  const currentComparison = comparison?.key === forecastKey && request?.key === forecastKey ? comparison : null;
  const calculating = active && currentComparison?.status === 'running';
  const regions = {europe:'유럽','north-america':'북미',asia:'아시아',other:'기타'};
  return <section className="guided-stage-panel guided-strategy-stage step04-redesign">
    <div className="guided-panel-title"><div><h1>{uiT("적재 방식 선택")}</h1><p>{uiT("화물을 싣는 방식과 최적화 목표를 고릅니다. 같은 수량이면 팔레트를 적게 쓰는 후보를 우선합니다.")}</p></div>
      <span className={`guided-strategy-status ${!reason?'ready':''}`}>{reason ? <>{!confirmed?uiT("제품 포장 확정 필요"):uiT(reason)}{!confirmed && <button type="button" onClick={onPackaging}>{uiT("3단계로 이동")}</button>}</>:uiT("선택 완료")}</span></div>
    <div className="step04-context">
      <div><small>{uiT("적재 공간")}</small><b>{equipment.shortName} {uiT("· 내폭")} {Math.round(input.container.width*1000).toLocaleString()} mm</b></div>
      <label>{uiT("운송 구분")}<select value={destination.transport} onChange={e=>updateDestination({transport:e.target.value as typeof destination.transport})}><option value="domestic">{uiT("내수")}</option><option value="export">{uiT("수출")}</option></select></label>
      {destination.transport==='export' && <label>{uiT("도착 지역")}<select value={destination.region} onChange={e=>updateDestination({region:e.target.value as typeof destination.region})}>{Object.entries(regions).map(([key,label])=><option value={key} key={key}>{uiT(label)}</option>)}</select></label>}
      <label>{uiT("수령처 지정 팔레트 규격")}<select value={destination.requiredSize} onChange={e=>updateDestination({requiredSize:e.target.value as typeof destination.requiredSize})}><option value="">{uiT("지정 없음")}</option>{['1100x1100','1200x1000','1200x800','1219x1016'].map(size=><option key={size} value={size}>{size.replace('x','×')} mm</option>)}</select></label>
      <small>{uiT("지정 규격은 실제 계산에 적용됩니다. 도착 지역의 수입·수령 조건은 별도 확인이 필요합니다.")}</small>
    </div>
    <section className="step04-section guided-loading-unit-inline" aria-label={uiT("적재 유형 선택")}><h2>{uiT("1. 적재 유형")}</h2>
      <div className="guided-loading-unit-grid" role="radiogroup" aria-label={uiT("적재 유형")}>{modes.map(option=><button key={option.id} type="button" role="radio" aria-checked={mode===option.id} className={mode===option.id?'selected':''} onClick={()=>chooseMode(option.id)}><span><b>{uiT(option.title)}</b><small>{uiT(option.detail)}</small></span></button>)}</div>
      {mode==='mixed' && <div className="step04-sku-choices" aria-label={uiT("품목별 혼합 적재 지정")}><p>{uiT("지정한 팔레트 화물은 직접 적재로 전환하지 않습니다. 정량·잔량 박스에 같은 지정을 적용합니다.")}</p>{products.map(item=><label key={item.productId??item.id}><span>{item.productName??item.name}</span><select aria-label={uiT("{0} 혼합 적재 방식", [item.productName??item.name])} value={item.mixedLoadingMethod??''} onChange={e=>updateProduct(item,{mixedLoadingMethod:e.target.value as 'pallet'|'direct'})}><option value="" disabled>{uiT("선택 필요")}</option><option value="pallet">{uiT("팔레트")}</option><option value="direct">{uiT("박스 직접 적재")}</option></select></label>)}</div>}
      {mode!=='boxes' ? <GuidedPalletTypePicker mode={mode} input={input} strategy={currentStrategy??'capacity'} active={active&&confirmed} /> : <CargoStackRestrictionNotice cargo={input.cargo}/>}
    </section>
    <section className="step04-section"><div className="step04-section-heading"><div><h2>{uiT("2. 최적화 목표")}</h2><p>{uiT("팔레트 수가 같으면 선택한 목표로 비교합니다. 비교 예측은 최종 적재·관성 검사와 별개입니다.")}</p></div><button type="button" disabled={!confirmed||!strategy||calculating||Boolean(reason)} onClick={()=>setRequest({key:forecastKey,first:currentStrategy??'capacity',version:(request?.version??0)+1})}>{uiT("예상 결과 비교")}</button>{calculating && <button type="button" onClick={()=>{setRequest(null);setComparison(null);}}>{uiT("비교 취소")}</button>}</div>
      <div className="guided-strategy-grid" role="radiogroup" aria-label={uiT("최적화 목표")}>{objectives.map(option=>{
        const forecast=currentComparison?.results.find(f=>f.strategy===option.id);
        return <button key={option.id} type="button" role="radio" aria-checked={currentStrategy===option.id} className={`guided-strategy-card ${currentStrategy===option.id?'selected':''}`} onClick={()=>onStrategy(option.id)}>
          <strong>{uiT(option.title)}</strong><small>{uiT(option.detail)}</small><dl className="step04-forecast"><div><dt>{uiT("적재 수량")}</dt><dd>{forecast?uiT("{0}개", [forecast.loaded.toLocaleString()]):uiT("미계산")}</dd></div><div><dt>{uiT("용적률")}</dt><dd>{forecast?`${forecast.volumePct.toFixed(1)}%`:uiT("미계산")}</dd></div><div><dt>{uiT("무게중심 편차")}</dt><dd>{forecast?.cogDeviationMm!=null?`${Math.round(forecast.cogDeviationMm)} mm`:uiT("미계산")}</dd></div></dl>
          {forecast && <small>{uiT("팔레트")} {forecast.pallets}{uiT("장 · 미적재")} {forecast.waiting}{uiT("개 · 계산상 오류")} {forecast.errors}{uiT("건")}</small>}
        </button>;
      })}</div>
      <p className="step04-help" role="status">{calculating?uiT("목표 비교 계산 중 · {0}/2", [currentComparison?.results.length??0]):currentComparison?.status==='error'?currentComparison.error:uiT("편차는 적재공간 수평 중심에서 화물·팔레트 무게중심까지의 거리입니다. 입력 변경 시 이전 예측은 표시하지 않습니다.")}</p>
    </section>
    <section className="step04-section"><h2>{uiT("3. 하역 순서")} {stops>1?uiT("· 착지 {0}곳", [stops]):''}</h2>
      <details className="step04-sku-choices"><summary>{uiT("품목별 착지 번호 · 같은 배송지는 같은 번호")}</summary>{products.map(item=><label key={item.productId??item.id}><span>{item.productName??item.name}</span><input aria-label={uiT("{0} 하역 순서", [item.productName??item.name])} type="number" min="1" step="1" value={item.unloadPriority??1} onChange={e=>{const stop=Number(e.target.value);if(Number.isInteger(stop)&&stop>0)updateProduct(item,{unloadPriority:stop});}}/></label>)}</details>
      {stops>1 ? <div className="guided-strategy-grid" role="radiogroup" aria-label={uiT("하역 조건")}>{[{id:'strict',title:uiT("엄격"),text:uiT("먼저 내릴 화물의 반출 경로를 막는 배치를 허용하지 않습니다.")},{id:'soft',title:uiT("완화"),text:uiT("경로 막힘은 경고로 표시하며 현장 재취급이 필요합니다. 지지·하중 검사는 유지합니다.")}].map(option=><button type="button" key={option.id} role="radio" aria-checked={strict===(option.id==='strict')} className={`guided-strategy-card ${strict===(option.id==='strict')?'selected':''}`} onClick={()=>updateContainer({unloadingPolicy:option.id as 'strict'|'soft'})}><strong>{uiT(option.title)}</strong><small>{uiT(option.text)}</small></button>)}</div> : <p>{uiT("착지가 2곳 이상이면 엄격·완화 조건을 선택할 수 있습니다. 착지 번호를 제품 순서로 자동 생성하지 않습니다.")}</p>}
    </section>
    <section className="step04-section" aria-label={uiT("혼적·온도 구분")}><h2>{uiT("4. 혼적·온도 구분")} {classifiedCount?uiT("· 입력 {0}품목", [classifiedCount]):''}</h2>
      <p className="step04-help">{uiT("구분이나 온도대를 입력한 품목만 검사합니다. 금지 조합이 함께 실리면 배치는 보여 주되 오류로 표시하고 PASS할 수 없습니다.")}</p>
      <details className="step04-sku-choices"><summary>{uiT("품목별 화물 구분 · 온도대")}</summary>{products.map(item=>{
        const name=item.productName??item.name;
        return <div className="step04-segregation-row" key={item.productId??item.id}><span>{name}</span>
          <select aria-label={uiT("{0} 화물 구분", [name])} value={item.segregationClass??''} onChange={e=>updateProduct(item,{segregationClass:e.target.value||undefined})}><option value="">{uiT("구분 없음")}</option>{SEGREGATION_CLASSES.map(value=><option key={value} value={value}>{uiT(value)}</option>)}</select>
          <select aria-label={uiT("{0} 온도대", [name])} value={item.tempZone??''} onChange={e=>updateProduct(item,{tempZone:e.target.value||undefined})}><option value="">{uiT("온도대 없음")}</option>{TEMP_ZONES.map(value=><option key={value} value={value}>{uiT(value)}</option>)}</select>
        </div>;
      })}</details>
      <div className="step04-pairs" aria-label={uiT("함께 실을 수 없는 조합")}>
        <b>{uiT("함께 실을 수 없는 조합")}</b>
        {incompatiblePairs.length ? <ul>{incompatiblePairs.map(([a,b])=><li key={`${a}|${b}`}><span>{uiT(a)} ↔ {uiT(b)}</span><button type="button" aria-label={uiT("{0} {1} 조합 삭제", [a, b])} onClick={()=>updateContainer({incompatiblePairs:removeIncompatiblePair(incompatiblePairs,a,b)})}>{uiT("삭제")}</button></li>)}</ul>
          : <p>{uiT("등록된 금지 조합이 없습니다. 조합을 등록해야 혼적 검사가 작동합니다.")}</p>}
        <div className="step04-pair-editor">
          <select aria-label={uiT("금지 조합 첫째 구분")} value={pairDraft[0]} onChange={e=>setPairDraft([e.target.value,pairDraft[1]])}>{SEGREGATION_CLASSES.map(value=><option key={value} value={value}>{uiT(value)}</option>)}</select>
          <span aria-hidden="true">↔</span>
          <select aria-label={uiT("금지 조합 둘째 구분")} value={pairDraft[1]} onChange={e=>setPairDraft([pairDraft[0],e.target.value])}>{SEGREGATION_CLASSES.map(value=><option key={value} value={value}>{uiT(value)}</option>)}</select>
          <button type="button" disabled={pairDraft[0]===pairDraft[1]} onClick={()=>updateContainer({incompatiblePairs:addIncompatiblePair(incompatiblePairs,pairDraft[0],pairDraft[1])})}>{uiT("조합 추가")}</button>
          <button type="button" onClick={()=>updateContainer({incompatiblePairs:addRecommendedPairs(incompatiblePairs)})}>{uiT("권장 조합 넣기")}</button>
        </div>
      </div>
      {(segregation.conflicts.length>0 || segregation.mixedZones.length>0) && <p className="step04-segregation-alert" role="status">
        {segregation.conflicts.length>0 && <span>{uiT("현재 품목에 금지 조합이 있습니다:")} {segregation.conflicts.map(([a,b])=>`${uiT(a)} ↔ ${uiT(b)}`).join(', ')}. </span>}
        {segregation.mixedZones.length>0 && <span>{uiT("온도대가 섞여 있습니다:")} {segregation.mixedZones.map(zone => uiT(zone)).join(', ')}. </span>} {uiT("이대로 적재하면 오류로 표시되고 PASS할 수 없습니다.")} </p>}
    </section>
    <section className="step04-section"><h2>{uiT("유지되는 검사 조건")}</h2><div className="step04-checks">{[uiT("경계와 충돌"),uiT("지지율"),uiT("적층 하중"),uiT("최대 적재중량"),uiT("무게중심")].map(label=><span key={label}>{uiT(label)}</span>)}<span>{uiT("바닥 선하중 ·")} {input.container.rules?.floorLineLoadKgPerM?uiT("설정값 검사"):uiT("제원 미입력")}</span><span>{uiT("축하중 ·")} {equipment.category==='truck'?(input.container.rules?.axles?uiT("설정값 검사"):uiT("실제 축 제원 미입력")):uiT("컨테이너 비대상")}</span><span>{uiT("혼적 금지 ·")} {incompatiblePairs.length?uiT("등록 조합 {0}건 검사", [incompatiblePairs.length]):uiT("조합 미등록")}</span></div><p className="step04-help">{uiT("최종 배치에 대해 검사를 실행합니다. 대표값과 계산 결과는 실제 운송 안전 인증이 아닙니다.")}</p></section>
  </section>;
}
