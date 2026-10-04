import { expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { packMixedMode } from './mixedModePacking';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import { palletSpecForType, findPalletType } from './palletCatalog';
import { palletDestinationFit } from './palletDestination';
import { unloadingObstructions } from './operationalQuality';
import { validateOperationalLoading } from './operationalValidator';
import { aConfig } from './loadingRuleset';
import { acceptsUnloadCandidate } from './unloadingPolicy';
import { buildPalletAdaptiveCandidates } from './palletAdaptiveSearch';
import { evaluatePalletType } from './palletRecommendation';
import { cargoWithUnloadingPolicy } from './unloadingPolicy';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container:ContainerSpec={length:4.4,width:1.1,height:2.5,maxPayloadKg:2000};
const item:CargoItem={id:'A',name:'A',length:.5,width:.5,height:.3,weightKg:10,quantity:2,maxStackLayers:5,maxTopLoadKg:1000};
const stops=[{...item,unloadPriority:1},{...item,id:'B',unloadPriority:2}];
const p=(cargoId:string,x:number,z=0):Placement=>({cargoId,x,y:0,z,length:.5,width:.5,height:.3,weightKg:10});

for(const strategy of ['capacity','stability'] as const) it(`${strategy} respects strict unloading independently of objective`,()=>{
  const result=loadContainer({...container,unloadingPolicy:'strict'},stops,{strategy,publish:false});
  expect(result.placements).toHaveLength(4);
  expect(unloadingObstructions(stops,result.placements)).toBe(0);
  expect(result.validationIssues).toEqual([]);
});

for(const strategy of ['capacity','stability'] as const) it(`A ${strategy} also keeps independent strict unloading with an unspecified first stop`,()=>{
  const c:ContainerSpec={...container,unloadingPolicy:'strict',rules:{version:'a-v1',equipmentId:'test',kind:'container',access:['rear'],source:'synthetic'}};
  const cargo=[item,{...item,id:'B',unloadPriority:2}];
  const result=loadContainer(c,cargo,{strategy,publish:false});
  expect(result.placements).toHaveLength(4);
  expect(unloadingObstructions(cargoWithUnloadingPolicy(c,cargo),result.placements)).toBe(0);
  expect(result.operationalFindings?.filter(f=>f.severity==='error')??[]).toEqual([]);
});

it('strict candidates check both directions, above blocking; soft keeps physical failures as errors',()=>{
  const cargo=new Map(stops.map(i=>[i.id,i]));
  expect(acceptsUnloadCandidate({...container,unloadingPolicy:'strict'},cargo,[p('A',0)],p('B',.5))).toBe(false);
  expect(acceptsUnloadCandidate({...container,unloadingPolicy:'strict'},cargo,[p('B',.5)],p('A',0))).toBe(false);
  expect(acceptsUnloadCandidate({...container,unloadingPolicy:'strict'},cargo,[p('A',0)],p('B',0,.3))).toBe(false);
  expect(acceptsUnloadCandidate({...container,unloadingPolicy:'soft'},cargo,[p('A',0)],p('B',.5))).toBe(true);
  const blocked=[p('A',0),p('B',.5)];
  expect(validateOperationalLoading({...container,unloadingPolicy:'strict'},stops,blocked).find(f=>f.code==='UNLOAD_BLOCKED')?.severity).toBe('error');
  expect(validateOperationalLoading({...container,unloadingPolicy:'soft'},stops,blocked).find(f=>f.code==='UNLOAD_BLOCKED')?.severity).toBe('warning');
  expect(validateOperationalLoading({...container,unloadingPolicy:'soft'},stops,[p('A',-1)]).some(f=>f.code==='OUT_OF_BOUNDS'&&f.severity==='error')).toBe(true);
  expect(aConfig({...container,unloadingPolicy:'soft'}).strictUnloadOrder).toBe(false);
  expect(aConfig({...container,unloadingPolicy:'strict'}).strictUnloadOrder).toBe(true);
});

it('mixed honors explicit pallet/direct assignments and does not demote protected partial pallets',()=>{
  const cargo:CargoItem[]=[{...item,quantity:1,mixedLoadingMethod:'pallet'},{...item,id:'B',quantity:2,mixedLoadingMethod:'direct'}];
  const result=packMixedMode(container,cargo,{...defaultPalletSpec,maxStackLevels:1},'capacity');
  expect(result.placements).toHaveLength(3);
  expect(result.remaining).toEqual([]);
  expect(result.palletCount).toBe(1);
  expect(result.pallets.flatMap(p=>p.cargoPlacements).map(p=>p.cargoId)).toEqual(['A']);
  expect(result.mixed.directBoxCount).toBe(2);
  expect(result.mixed.demotedPalletCount).toBe(0);
  // A pallet-only adaptive search must not reclassify the direct cargo after physics.
  expect(buildPalletAdaptiveCandidates({mode:'pallets',container,cargo,result:{placements:result.placements,remaining:result.remaining,loadedWeightKg:result.mixed.totalLoadedWeightKg,usedVolumeM3:1,validationIssues:[]}}, {spec:defaultPalletSpec,result})).toEqual([]);
  expect(packMixedMode(container,cargo,{...defaultPalletSpec,maxStackLevels:1},'capacity')).toEqual(result);
});

it('an explicitly palletized item too large for the deck stays waiting',()=>{
  const cargo=[{...item,length:1.5,quantity:1,mixedLoadingMethod:'pallet' as const}];
  const result=packMixedMode(container,cargo,defaultPalletSpec,'capacity');
  expect(result.placements).toHaveLength(0);
  expect(result.remaining.reduce((sum,r)=>sum+r.quantity,0)).toBe(1);
});

it('missing static pallet capacity forbids stacked bases; declared static capacity checks full deck load',()=>{
  const unknown=palletSpecForType(findPalletType('t12-wood-epal3')!);
  expect(unknown.maxStackLevels).toBe(1);
  expect(unknown.maxStaticLoadKg).toBe(0);
  const c={...container,length:1.1,height:2};
  const cargo=[{...item,length:.55,width:.55,quantity:8}];
  const base={...defaultPalletSpec,maxLoadKg:40,maxStaticLoadKg:60};
  const low=packOnPallets(c,cargo,base,'capacity');
  const high=packOnPallets(c,cargo,{...base,maxStaticLoadKg:150},'capacity');
  expect(low.placements.length).toBeLessThan(high.placements.length);
  expect(low.maxUsedStackLevel).toBe(1);
  expect(high.placements).toHaveLength(8);
});

it('a consignee mismatch is explicit, while export suitability remains unverified',()=>{
  const c:ContainerSpec={...container,palletDestination:{transport:'export',region:'europe',requiredSize:'1200x1000'}};
  expect(palletDestinationFit(c,findPalletType('company-default')!).status).toBe('incompatible');
  expect(palletDestinationFit(c,findPalletType('t12-wood-epal3')!).status).toBe('check');
});

it('a missing stop uses the same first-stop default as STEP04 and mixed recommendations retain direct assignments',()=>{
  const c:ContainerSpec={...container,unloadingPolicy:'strict'};
  expect(cargoWithUnloadingPolicy(c,[item])[0].unloadPriority).toBe(1);
  expect(validateOperationalLoading(c,[item,{...item,id:'B',unloadPriority:2}],[p('A',0),p('B',.5)]).some(f=>f.code==='UNLOAD_BLOCKED')).toBe(true);
  const direct=[{...item,quantity:4,mixedLoadingMethod:'direct' as const}];
  const result=evaluatePalletType(c,direct,findPalletType('company-default')!,'capacity',undefined,'mixed');
  expect(result.loadedUnits).toBe(4);
  expect(result.palletCount).toBe(0);
});
