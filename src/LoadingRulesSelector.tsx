import { readLoadingRuleset, setLoadingRuleset, useLoadingRuleset, aEquipmentDefault } from './loadingRulesPreference';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { readTransportEquipmentSpecOverrides } from './transportEquipmentSpecOverrides';
import type { LoadingRuleset } from './engine/loadingRuleset';
import './loading-rules.css';

export default function LoadingRulesSelector(){
  const selected=useLoadingRuleset();
  const description=selected==='a-v1'?'A 대표값 적용 · 기존 전용 기능 유지 · 계산 결과는 운송 안전 인증이 아닙니다.':'규칙을 바꾸면 이전 적재·점검 결과가 초기화됩니다.';
  const change=(value:LoadingRuleset)=>{
    if(value===readLoadingRuleset())return;
    const equipment=readTransportEquipment(), base=getTransportEquipment(equipment.id);
    setLoadingRuleset(value);
    // Explicit equipment overrides always win over both catalogs.
    if(base && !readTransportEquipmentSpecOverrides()[equipment.id] && equipment.geometry!=='custom') {
      const previous=selected==='a-v1'?aEquipmentDefault(base):base;
      if(['length','width','height','maxPayloadKg'].every(k=>equipment[k as 'length']===previous[k as 'length'])) selectTransportEquipment(value==='a-v1'?aEquipmentDefault(base):base);
    }
  };
  return <section className="loading-rules-selector" aria-label="적재 규칙 선택" title={description}>
    <label htmlFor="loading-rules-choice">적재 규칙</label>
    <select id="loading-rules-choice" aria-describedby="loading-rules-description" value={selected} onChange={e=>change(e.target.value as LoadingRuleset)}>
      <option value="legacy">기존 규칙</option><option value="a-v1">A 규칙</option>
    </select>
    <span id="loading-rules-description">{description}</span>
  </section>;
}
