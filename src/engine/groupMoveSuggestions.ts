import { assessGroupMove } from './groupPlacement';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

export type GroupMoveSuggestion = {
  delta: { x:number; y:number; z:number };
  score: number;
  label: string;
  quality: number;
  maxFloorLoadKgPerM2: number;
  centerX: number;
};

const round05 = (v:number) => Math.round(v / 0.05) * 0.05;

function bounds(indices:number[], placements:Placement[]) {
  const selected = indices.map(i => placements[i]).filter(Boolean);
  const minX = Math.min(...selected.map(p=>p.x));
  const minY = Math.min(...selected.map(p=>p.y));
  const minZ = Math.min(...selected.map(p=>p.z));
  const maxX = Math.max(...selected.map(p=>p.x+p.length));
  const maxY = Math.max(...selected.map(p=>p.y+p.width));
  return { minX,minY,minZ,maxX,maxY };
}

export function suggestGroupMoves(
  container:ContainerSpec,
  cargo:CargoItem[],
  source:LoadingResult,
  indices:number[],
  nearDelta:{x:number;y:number;z:number}={x:0,y:0,z:0},
  limit=3,
):GroupMoveSuggestion[] {
  if (!indices.length) return [];
  const b = bounds(indices,source.placements);
  const candidates = new Map<string,{x:number;y:number;z:number;label:string}>();
  const add=(x:number,y:number,z:number,label:string)=>{
    const d={x:round05(x),y:round05(y),z:round05(z)};
    const key=`${d.x.toFixed(2)}|${d.y.toFixed(2)}|${d.z.toFixed(2)}`;
    if (Math.abs(d.x)+Math.abs(d.y)+Math.abs(d.z) < 0.001) return;
    if (!candidates.has(key)) candidates.set(key,{...d,label});
  };

  add(nearDelta.x,nearDelta.y,nearDelta.z,'드래그 근처');
  add(-b.minX,0,0,'안쪽 벽 정렬');
  add(container.length-b.maxX,0,0,'문쪽 벽 정렬');
  add(0,-b.minY,0,'좌측 벽 정렬');
  add(0,container.width-b.maxY,0,'우측 벽 정렬');
  add(0,0,-b.minZ,'바닥 정렬');

  for (let dx=-0.5; dx<=0.5+1e-9; dx+=0.25) {
    for (let dy=-0.5; dy<=0.5+1e-9; dy+=0.25) {
      add(nearDelta.x+dx,nearDelta.y+dy,nearDelta.z,'주변 빈 공간');
    }
  }

  const out:GroupMoveSuggestion[]=[];
  for (const candidate of candidates.values()) {
    const assessment=assessGroupMove(container,cargo,source,indices,candidate);
    if (!assessment.valid) continue;
    const distance=Math.hypot(candidate.x-nearDelta.x,candidate.y-nearDelta.y,candidate.z-nearDelta.z);
    const qualityGain=assessment.after.quality-assessment.before.quality;
    const floorGain=assessment.before.maxFloorLoadKgPerM2-assessment.after.maxFloorLoadKgPerM2;
    const centerTarget=container.length/2;
    const centerGain=Math.abs(assessment.before.centerX-centerTarget)-Math.abs(assessment.after.centerX-centerTarget);
    const insideBias=-Math.max(0,candidate.x)*0.8;
    const lowBias=-Math.max(0,candidate.z)*2;
    const score=qualityGain*1.6+floorGain*0.01+centerGain*5-distance*2+insideBias+lowBias;
    out.push({delta:assessment.delta,score,label:candidate.label,quality:assessment.after.quality,maxFloorLoadKgPerM2:assessment.after.maxFloorLoadKgPerM2,centerX:assessment.after.centerX});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,Math.max(1,limit));
}
