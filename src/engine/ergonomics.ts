import type { LoadingResult } from './types';

export type ErgonomicSettings = {
  comfortableReachM: number;
  manualHandlingKg: number;
};

export type ErgonomicRisk = {
  placementIndex: number;
  cargoId: string;
  level: 'warn' | 'high';
  topM: number;
  weightKg: number;
  reasons: string[];
};

export const DEFAULT_ERGONOMIC_SETTINGS: ErgonomicSettings = {
  comfortableReachM: 2.0,
  manualHandlingKg: 15,
};

export function analyzeErgonomics(result: LoadingResult, settings: ErgonomicSettings): ErgonomicRisk[] {
  const reach = Math.max(0.5, settings.comfortableReachM || DEFAULT_ERGONOMIC_SETTINGS.comfortableReachM);
  const weight = Math.max(1, settings.manualHandlingKg || DEFAULT_ERGONOMIC_SETTINGS.manualHandlingKg);
  return result.placements.flatMap((p,index) => {
    const top = p.z + p.height;
    const reasons:string[]=[];
    if(top > reach) reasons.push(`상단 높이 ${top.toFixed(2)}m가 설정 도달 높이 ${reach.toFixed(2)}m를 초과`);
    if(p.weightKg > weight) reasons.push(`중량 ${p.weightKg.toFixed(1)}kg가 설정 수동 취급 기준 ${weight.toFixed(1)}kg를 초과`);
    if(!reasons.length) return [];
    return [{ placementIndex:index, cargoId:p.cargoId, level:(top>reach && p.weightKg>weight)?'high':'warn', topM:top, weightKg:p.weightKg, reasons } satisfies ErgonomicRisk];
  }).sort((a,b)=>(b.level==='high'?1:0)-(a.level==='high'?1:0) || b.topM-a.topM || b.weightKg-a.weightKg);
}
