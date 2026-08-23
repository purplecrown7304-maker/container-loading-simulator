import { describe, expect, it } from 'vitest';
import { suggestGroupMoves } from './groupMoveSuggestions';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container:ContainerSpec={length:6,width:2.4,height:2.6,maxPayloadKg:28000};
const cargo:CargoItem[]=[{id:'A',name:'A',length:1,width:1,height:1,weightKg:100,quantity:2,maxStackLayers:3,maxTopLoadKg:500}];
const result:LoadingResult={placements:[
  {cargoId:'A',x:0,y:0,z:0,length:1,width:1,height:1,weightKg:100},
  {cargoId:'A',x:1,y:0,z:0,length:1,width:1,height:1,weightKg:100},
],remaining:[],loadedWeightKg:200,usedVolumeM3:2,validationIssues:[],autoCorrections:[]};

describe('group move suggestions',()=>{
  it('returns at most three safe ranked candidates',()=>{
    const list=suggestGroupMoves(container,cargo,result,[0,1],{x:1,y:0,z:0},3);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(list.every((item,i)=>i===0||list[i-1].score>=item.score)).toBe(true);
  });

  it('returns no candidates for empty selection',()=>{
    expect(suggestGroupMoves(container,cargo,result,[],{x:0,y:0,z:0},3)).toEqual([]);
  });
});
