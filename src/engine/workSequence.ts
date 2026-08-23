import { buildPlacementAddresses } from './locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

const EPS = 0.001;

export type WorkStep = {
  step: number;
  placementIndex: number;
  cargoId: string;
  label: string;
  action: 'LOAD' | 'UNLOAD';
  x: number;
  y: number;
  z: number;
  row: number;
  column: number;
  layer: number;
  zone: '안쪽' | '중앙' | '문쪽';
  unloadPriority?: number;
  instruction: string;
};

function overlapArea(a: Placement, b: Placement): number {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
}

function directlySupports(lower: Placement, upper: Placement): boolean {
  return Math.abs(lower.z + lower.height - upper.z) <= EPS && overlapArea(lower, upper) > EPS;
}

function sortWithDependencies(indices: number[], placements: Placement[], mode: 'load' | 'unload', priority: (index:number)=>number): number[] {
  const remaining = new Set(indices);
  const done = new Set<number>();
  const output: number[] = [];
  while (remaining.size) {
    const available = [...remaining].filter(index => {
      if (mode === 'load') {
        return placements.every((other, otherIndex) => !directlySupports(other, placements[index]) || done.has(otherIndex));
      }
      return placements.every((other, otherIndex) => !directlySupports(placements[index], other) || done.has(otherIndex));
    });
    const pool = available.length ? available : [...remaining];
    pool.sort((a,b) => priority(a) - priority(b));
    const chosen = pool[0];
    output.push(chosen);
    remaining.delete(chosen);
    done.add(chosen);
  }
  return output;
}

export function buildWorkSequence(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, action: 'LOAD' | 'UNLOAD'): WorkStep[] {
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const cargoById = new Map(cargo.map(item => [item.id,item]));
  const all = result.placements.map((_,index)=>index);
  const order = action === 'LOAD'
    ? sortWithDependencies(all,result.placements,'load',index => {
        const p = result.placements[index];
        const a = addresses[index];
        return p.z*100000 + p.x*1000 + p.y*10 + (a?.column ?? 0);
      })
    : sortWithDependencies(all,result.placements,'unload',index => {
        const p = result.placements[index];
        const item = cargoById.get(p.cargoId);
        const priority = item?.unloadPriority ?? 999;
        return priority*100000 - p.z*1000 - p.x*10 + p.y;
      });

  return order.map((index,stepIndex) => {
    const p = result.placements[index];
    const a = addresses[index];
    const item = cargoById.get(p.cargoId);
    const actionWord = action === 'LOAD' ? '적재' : '하역';
    return {
      step: stepIndex + 1,
      placementIndex: index,
      cargoId: p.cargoId,
      label: item?.name || p.cargoId,
      action,
      x:p.x,y:p.y,z:p.z,
      row:a?.row ?? 0,column:a?.column ?? 0,layer:a?.layer ?? 0,zone:a?.zone ?? '중앙',
      unloadPriority:item?.unloadPriority,
      instruction:`${stepIndex+1}번 · ${p.cargoId} ${actionWord} · R${a?.row ?? '-'} C${a?.column ?? '-'} L${a?.layer ?? '-'} · ${a?.zone ?? ''} · X ${p.x.toFixed(2)} / Y ${p.y.toFixed(2)} / Z ${p.z.toFixed(2)}m`,
    };
  });
}
