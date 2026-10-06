import { describe,it,expect } from 'vitest';
import { canPlaceByStackingRules, projectedTopLoadKg } from './stacking';
import type { CargoItem,Placement } from './types';
const box=(id:string,maxTopLoadKg:number):CargoItem=>({id,name:id,length:1,width:1,height:1,weightKg:2,quantity:1,maxStackLayers:10,maxTopLoadKg});
const place=(cargoId:string,x:number,z:number,length=1,weightKg=2):Placement=>({cargoId,x,y:0,z,length,width:1,height:1,weightKg});
describe('ancestor-only compression checks',()=>{
  it('matches the former all-base checks on valid columns with many unrelated stacks',()=>{
    for(const limit of [4,5,6,7,10]){
      const item=box('A',limit); const map=new Map([['A',item]]);
      const existing=Array.from({length:80},(_,i)=>place('A',i%40,Math.floor(i/40)));
      for(const x of [0,12,39]){
        const candidate=place('A',x,2,1,3);
        const prior=existing.every(base=>projectedTopLoadKg(base,candidate,existing)<=limit+.001);
        expect(canPlaceByStackingRules(item,candidate,existing,map)).toBe(prior);
      }
    }
  });
  it('still transmits full bridge weight to each supporting chain without double counting the shared base',()=>{
    const base=place('BASE',0,0,2),left=place('MID',0,1),right=place('MID',1,1);
    const candidate=place('TOP',0,2,2,3);
    const placements=[base,left,right];
    for(const limit of [6,7]){
      const map=new Map([['BASE',box('BASE',limit)],['MID',box('MID',3)],['TOP',box('TOP',100)]]);
      expect(projectedTopLoadKg(base,candidate,placements)).toBe(7);
      expect(canPlaceByStackingRules(map.get('TOP')!,candidate,placements,map)).toBe(limit===7);
    }
  });
});
