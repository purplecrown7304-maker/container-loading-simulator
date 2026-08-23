import { describe, expect, it } from 'vitest';
import { buildWorkSequence } from './workSequence';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length:6, width:2.4, height:2.6, maxPayloadKg:28000 };
const cargo: CargoItem[] = [
  { id:'A', name:'A', length:1, width:1, height:1, weightKg:100, quantity:2, unloadPriority:2 },
  { id:'B', name:'B', length:1, width:1, height:1, weightKg:100, quantity:1, unloadPriority:1 },
];
const result: LoadingResult = {
  placements:[
    { cargoId:'A', x:0,y:0,z:0,length:1,width:1,height:1,weightKg:100 },
    { cargoId:'A', x:0,y:0,z:1,length:1,width:1,height:1,weightKg:100 },
    { cargoId:'B', x:5,y:0,z:0,length:1,width:1,height:1,weightKg:100 },
  ],
  remaining:[], loadedWeightKg:300, usedVolumeM3:3, validationIssues:[], autoCorrections:[],
};

describe('work sequence',()=>{
  it('loads a supporting box before the box above it',()=>{
    const steps=buildWorkSequence(container,cargo,result,'LOAD');
    const lower=steps.findIndex(s=>s.placementIndex===0);
    const upper=steps.findIndex(s=>s.placementIndex===1);
    expect(lower).toBeLessThan(upper);
  });
  it('unloads an upper box before its supporting lower box',()=>{
    const steps=buildWorkSequence(container,cargo,result,'UNLOAD');
    const lower=steps.findIndex(s=>s.placementIndex===0);
    const upper=steps.findIndex(s=>s.placementIndex===1);
    expect(upper).toBeLessThan(lower);
  });
  it('uses unload priority when dependency rules allow it',()=>{
    const steps=buildWorkSequence(container,cargo,result,'UNLOAD');
    const b=steps.findIndex(s=>s.cargoId==='B');
    const lowerA=steps.findIndex(s=>s.placementIndex===0);
    expect(b).toBeLessThan(lowerA);
  });
  it('returns stable numbered instructions',()=>{
    const steps=buildWorkSequence(container,cargo,result,'LOAD');
    expect(steps.map(s=>s.step)).toEqual([1,2,3]);
    expect(steps[0].instruction).toContain('적재');
  });
});
