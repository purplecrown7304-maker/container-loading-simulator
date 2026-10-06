import { describe, it, expect } from 'vitest';
import { floorLoadLayerCap, withinFloorLoadLimit, placementsWithinFloorLoadLimit } from './floorLoadLimit';
import { packByStrictWalls } from './strictWallPacker';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';
import { completeResidualPacking } from './residualPacking';
import { auditLoading } from './loadingAudit';
import type { CargoItem, Placement } from './types';
const container={length:1,width:1,height:5,maxPayloadKg:1000,floorLoadLimitKgPerM2:100};
const item:CargoItem={id:'A',name:'A',length:1,width:1,height:1,weightKg:40,quantity:5,maxStackLayers:10,maxTopLoadKg:1000};
const p=(extra:Partial<Placement>={}):Placement=>({cargoId:'A',x:0,y:0,z:0,length:1,width:1,height:1,weightKg:40,...extra});
const empty={placements:[],remaining:[],loadedWeightKg:0,usedVolumeM3:0};
describe('hard floor load limits',()=>{
  it('rejects a locally overloaded subregion even when full-footprint average is safe',()=>{
    const small=p({length:.25,weightKg:20});
    expect(withinFloorLoadLimit(container,p({z:1}),[small])).toBe(false); // 80+40 at narrow region, mean60
    expect(withinFloorLoadLimit(container,p({x:.25,length:.75,z:1,weightKg:30}),[small])).toBe(true);
  });
  it('has no ground exception, and accepts the exact limit',()=>{
    expect(floorLoadLayerCap(container,{...item,weightKg:101})).toBe(0);
    expect(withinFloorLoadLimit(container,p({weightKg:101}),[])).toBe(false);
    expect(withinFloorLoadLimit(container,p({weightKg:100}),[])).toBe(true);
  });
  for(const [name,pack] of [['strict',packByStrictWalls],['v2',packByBlockSpaceBeamV2],['residual',(c: typeof container,items: CargoItem[],strategy: 'capacity')=>completeResidualPacking(c,items,empty,strategy)]] as const){
    it(`${name} limits columns and explains rejected quantity`,()=>{
      const r=pack(container,[item],'capacity');
      expect(r.placements).toHaveLength(2);
      expect(r.remaining[0]).toMatchObject({quantity:3,reasonCode:'FLOOR_LOAD_LIMIT'});
      expect(placementsWithinFloorLoadLimit(container,r.placements)).toBe(true);
      expect(auditLoading(container,[item],r.placements)).toEqual([]);
      const overweight=pack(container,[{...item,weightKg:101,quantity:1}],'capacity');
      expect(overweight.placements).toHaveLength(0);
      expect(overweight.remaining[0].reasonCode).toBe('FLOOR_LOAD_LIMIT');
      const payload = pack({...container,maxPayloadKg:70},[item],'capacity');
      expect(payload.remaining[0].reasonCode).toBe('PAYLOAD_LIMIT');
    });
  }
  it('aggregate homogeneous block pressure equals sequential unit projection checks',()=>{
    const space={...container,length:2};
    const block=p({z:1,length:2,height:2,weightKg:160});
    for(const baseWeight of [0,5,15,30]) {
      const base=baseWeight ? [p({length:.5,weightKg:baseWeight})] : [];
      const staged=[...base]; let unitsPass=true;
      for(const z of [1,2]) for(const x of [0,1]) {
        const unit=p({x,z});
        if(!withinFloorLoadLimit(space,unit,staged)) unitsPass=false;
        staged.push(unit);
      }
      expect(withinFloorLoadLimit(space,block,base)).toBe(unitsPass);
    }
  });
  it('audits a previously created overloaded projection independently',()=>{
    expect(auditLoading(container,[item],[p(),p({z:1}),p({z:2})]).some(i=>i.message.startsWith('FLOOR_LOAD_LIMIT'))).toBe(true);
  });
  it('distinguishes a one-layer prohibition from the floor and payload limits',()=>{
    const single = {...item, maxStackLayers:1, quantity:2};
    const result = completeResidualPacking(container,[single],empty,'capacity');
    expect(result.placements).toHaveLength(1);
    expect(result.remaining[0]).toMatchObject({quantity:1,reasonCode:'STACK_LIMIT'});
  });
  it('does not affect unspecified limits or pallet-unit weights',()=>{
    const legacy={...container,floorLoadLimitKgPerM2:undefined};
    const result=packByStrictWalls(legacy,[item],'capacity');
    expect(result.placements).toHaveLength(5);
    expect(withinFloorLoadLimit(legacy,p({weightKg:10000}),[])).toBe(true);
    expect(packByBlockSpaceBeamV2(container,[{...item,unitKind:'pallet',floorOnly:true,weightKg:101,quantity:1}],'capacity').placements).toHaveLength(0);
  });
});


describe('deterministic floor-limited beam budget', () => {
  it('repeats a large constrained input exactly while preserving safety and quantities', () => {
    const cargo=[{...item,quantity:120}];
    const first=packByBlockSpaceBeamV2(container,cargo,'capacity');
    expect(packByBlockSpaceBeamV2(container,cargo,'capacity')).toEqual(first);
    expect(first.placements.length+first.remaining.reduce((n,r)=>n+r.quantity,0)).toBe(120);
    expect(auditLoading(container,cargo,first.placements)).toEqual([]);
    expect(first.placements.length).toBe(2);
  });
  it('ignores floor budget options entirely when no floor limit is configured', () => {
    const unrestricted={...container,floorLoadLimitKgPerM2:undefined,length:3};
    const cargo=[{...item,quantity:15}];
    const original=packByBlockSpaceBeamV2(unrestricted,cargo,'capacity');
    const options={floorBudget:{minRequestedCount:1,beamWidth:1,maxSpaces:1,maxCandidates:1,maxVariants:1}};
    expect(packByBlockSpaceBeamV2(unrestricted,cargo,'capacity',options)).toEqual(original);
  });
  it('accepts explicit budgets and falls back safely for invalid settings', () => {
    const cargo=[{...item,quantity:120}];
    const options={floorBudget:{minRequestedCount:1,beamWidth:1,maxSpaces:2,maxCandidates:2,maxVariants:2}};
    const result=packByBlockSpaceBeamV2(container,cargo,'capacity',options);
    expect(packByBlockSpaceBeamV2(container,cargo,'capacity',options)).toEqual(result);
    expect(auditLoading(container,cargo,result.placements)).toEqual([]);
    expect(packByBlockSpaceBeamV2(container,cargo,'capacity',{floorBudget:{beamWidth:NaN,maxSpaces:-1,maxCandidates:0,maxVariants:1.5}})).toEqual(packByBlockSpaceBeamV2(container,cargo,'capacity'));
  });
});
