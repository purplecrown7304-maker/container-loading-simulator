import { useSyncExternalStore } from 'react';
import type { LoadingRuleset, RulesContext } from './engine/loadingRuleset';
import { CONTAINERS } from './engine/loadSimA/presets';
import type { TransportEquipment } from './transportEquipment';
const KEY='container-loading:ruleset:v1';
export const RULESET_EVENT='container-loading:ruleset-changed';
const listeners=new Set<()=>void>();
export function readLoadingRuleset():LoadingRuleset {
  try { return typeof window!=='undefined' && localStorage.getItem(KEY)==='a-v1'?'a-v1':'legacy'; } catch{return 'legacy';}
}
export function setLoadingRuleset(value:LoadingRuleset){
  localStorage.setItem(KEY,value); listeners.forEach(l=>l()); window.dispatchEvent(new Event(RULESET_EVENT));
}
function subscribe(listener:()=>void){listeners.add(listener);window.addEventListener('storage',listener);return()=>{listeners.delete(listener);window.removeEventListener('storage',listener);};}
export function useLoadingRuleset(){return useSyncExternalStore(subscribe,readLoadingRuleset,()=> 'legacy' as const);}
const ids:Record<string,string>={'20-standard':'20GP','40-standard':'40GP','40-high-cube':'40HC','45-high-cube':'45HC'};
export function aEquipmentDefault(e:TransportEquipment):TransportEquipment{
  const a=CONTAINERS[ids[e.id]]; if(!a)return e;
  return {...e,length:a.inner.l/1000,width:a.inner.w/1000,height:a.inner.h/1000,maxPayloadKg:a.maxPayload,
    doorWidth:a.door!.w/1000,doorHeight:a.door!.h/1000,volumeM3:a.inner.l*a.inner.w*a.inner.h/1e9,sourceLabel:'A 규칙 대표 사양 (미검증)'};
}
export function equipmentRules(e:TransportEquipment):RulesContext{
  const preset=CONTAINERS[ids[e.id]];
  return {version:'a-v1',equipmentId:e.id,kind:e.category,source:e.sourceLabel,
    access:[...(['rear'] as const),...(e.sideLoading?['left' as const,'right' as const]:[]),...(e.topLoading?['top' as const]:[])],
    door:e.doorWidth&&e.doorHeight?{w:e.doorWidth*1000,h:e.doorHeight*1000}:undefined,
    tareKg:preset?.tare,floorLineLoadKgPerM:preset?.floorLineLoad};
}
