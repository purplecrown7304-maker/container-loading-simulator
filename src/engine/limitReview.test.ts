import { afterEach, describe, expect, it } from 'vitest';
import { loadContainer, restoreLoadingResult } from './loadingEngine';
import { actualPeakFloorLoad, resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { assessManualMove } from './manualPlacement';
import { assessGroupMove } from './groupPlacement';
import { clearManualOverride, readManualOverride, writeManualOverride } from './manualOverride';
import { packOnPallets } from './palletOptimization';
import { packMixedMode } from './mixedModePacking';
import type { CargoItem, ContainerSpec, LimitReviewConfig, LoadingResult, Placement } from './types';

const container:ContainerSpec={length:1,width:1,height:1,maxPayloadKg:1000};
const box:CargoItem={id:'box',name:'Box',length:1,width:1,height:.5,weightKg:60,quantity:2,maxStackLayers:2,maxTopLoadKg:1000,allowRotation:false};
const run=(spec:ContainerSpec,items:CargoItem[]=[box])=>loadContainer(spec,items,{publish:false});
const review=(spec:ContainerSpec,config:Omit<LimitReviewConfig,'mode'>):ContainerSpec=>({...spec,limitReview:{mode:'what-if',...config}});
const metric=(result:LoadingResult,key:string)=>result.limitReview!.metrics.find(m=>m.key===key)!;
afterEach(()=>{clearManualOverride();localStorage.clear();});

describe('explicit numerical WHAT-IF REVIEW',()=>{
  it('leaves the strict default bit-for-bit unchanged and remains deterministic',()=>{
    const a=run(container),b=run({...container,limitReview:undefined});
    expect(a).toEqual(b);expect(a.limitReview).toBeUndefined();
    const equal=review(container,{maxPayloadKg:1000});
    expect(run(equal).placements).toEqual(a.placements);
    expect(run(equal)).toEqual(run(equal));
  });
  it('normalizes identical duplicate SKU rows before review blockers and manual restoration',()=>{
    const items=[{...box,quantity:1},{...box,quantity:1}];
    const spec=review(container,{maxPayloadKg:1000});
    const strict=run(container,items),result=run(spec,items);
    expect(strict.placements).toHaveLength(2);
    expect(result.placements).toEqual(strict.placements);
    expect(result.validationIssues).toEqual([]);
    expect(reviewPlacementBlockers(spec,items,result.placements,result.securingBudget?.totalTransportWeightKg)).toEqual([]);
    const manual=assessManualMove(spec,items,result,1,result.placements[1]);
    expect(manual.valid).toBe(true);expect(manual.result.validationIssues).toEqual([]);
    const group=assessGroupMove(spec,items,result,[0,1],{x:0,y:0,z:0});
    expect(group.valid).toBe(true);expect(group.result.validationIssues).toEqual([]);
    writeManualOverride(spec,items,manual.result);
    const restored=restoreLoadingResult(spec,items);
    expect(restored.placements).toHaveLength(2);expect(restored.validationIssues).toEqual([]);
  });
  it('uses the selected payload INCLUDING current securing and retains original errors',()=>{
    const original={...container,maxPayloadKg:100};
    const selected=review(original,{maxPayloadKg:130});
    const snapshot=JSON.stringify([selected,box]);
    expect(run(original).placements).toHaveLength(1);
    const result=run(selected);
    expect(result.placements).toHaveLength(2);
    expect(result.securingBudget!.totalTransportWeightKg).toBeGreaterThan(120);
    expect(result.securingBudget!.totalTransportWeightKg).toBeLessThanOrEqual(130);
    expect(result.validationIssues.some(i=>i.type==='PAYLOAD')).toBe(true);
    expect(result.operationalFindings?.some(f=>f.code==='PAYLOAD_EXCEEDED'&&f.severity==='error')).toBe(true);
    expect(metric(result,'payload')).toMatchObject({originalLimit:100,scenarioLimit:130,actual:result.securingBudget!.totalTransportWeightKg,provenance:'configured'});
    expect(metric(result,'payload').excess).toBeCloseTo(result.securingBudget!.totalTransportWeightKg-100);
    expect(metric(result,'payload').excessPercent).toBeCloseTo(result.securingBudget!.totalTransportWeightKg-100);
    expect(JSON.stringify([selected,box])).toBe(snapshot);
  });
  it('does not let a selected payload override an unselected top-load limit',()=>{
    const items=[{...box,maxTopLoadKg:50}];
    const result=run(review({...container,maxPayloadKg:100},{maxPayloadKg:200}),items);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining[0].quantity).toBe(1);
  });
  it('does not use a cargo-only payload budget when securing would exceed the scenario',()=>{
    const result=run(review({...container,maxPayloadKg:100},{maxPayloadKg:121}));
    expect(result.placements).toHaveLength(1);
    expect(result.securingBudget!.totalTransportWeightKg).toBeLessThanOrEqual(121);
  });
  it('relaxes only selected floor load and reports true peak and excess',()=>{
    const original={...container,floorLoadLimitKgPerM2:100};
    expect(run(original).placements).toHaveLength(1);
    const result=run(review(original,{floorLoadLimitKgPerM2:150}));
    expect(result.placements).toHaveLength(2);
    expect(metric(result,'floor-load')).toMatchObject({originalLimit:100,scenarioLimit:150,actual:120,excess:20,excessPercent:20});
    expect(result.validationIssues.some(i=>i.message.includes('FLOOR_LOAD_LIMIT'))).toBe(true);
    expect(run(review(original,{maxPayloadKg:2000})).placements).toHaveLength(1);
  });
  it('reports stack depth and cumulative top load against original values independently',()=>{
    const items=[{...box,maxStackLayers:1,maxTopLoadKg:50}];
    const result=run(review(container,{cargoLimits:{box:{maxStackLayers:2,maxTopLoadKg:70}}}),items);
    expect(result.placements).toHaveLength(2);
    expect(metric(result,'stack-layers')).toMatchObject({originalLimit:1,scenarioLimit:2,actual:2,excess:1,excessPercent:100});
    expect(metric(result,'top-load')).toMatchObject({originalLimit:50,scenarioLimit:70,actual:60,excess:10,excessPercent:20});
    expect(result.validationIssues.map(i=>i.type)).toEqual(expect.arrayContaining(['STACK_LIMIT','TOP_LOAD']));
    expect(run(review(container,{cargoLimits:{box:{maxStackLayers:2}}}),items).placements).toHaveLength(1);
    expect(run(review(container,{cargoLimits:{box:{maxTopLoadKg:70}}}),items).placements).toHaveLength(1);
  });
  it('keeps unselected unverified strength limits and discloses zero-denominator provenance',()=>{
    const items=[{...box,strengthUnverified:true,maxStackLayers:8,maxTopLoadKg:999}];
    expect(run(review(container,{cargoLimits:{box:{maxStackLayers:2}}}),items).placements).toHaveLength(1);
    expect(run(review(container,{cargoLimits:{box:{maxTopLoadKg:100}}}),items).placements).toHaveLength(1);
    const result=run(review(container,{cargoLimits:{box:{maxStackLayers:2,maxTopLoadKg:100}}}),items);
    expect(result.placements).toHaveLength(2);
    expect(metric(result,'top-load')).toMatchObject({originalLimit:0,actual:60,excess:60,excessPercent:null,provenance:'unverified'});
    expect(items[0].strengthUnverified).toBe(true);
  });
  it('marks unknown original ratings explicitly instead of inventing an excess percentage',()=>{
    const result=run(review(container,{floorLoadLimitKgPerM2:150,cargoLimits:{box:{maxTopLoadKg:100}}}),[{...box,maxTopLoadKg:undefined}]);
    expect(metric(result,'floor-load')).toMatchObject({originalLimit:null,provenance:'unknown',excess:null,excessPercent:null});
    expect(metric(result,'top-load')).toMatchObject({originalLimit:null,provenance:'unknown',excess:null,excessPercent:null});
  });
  it.each([NaN,Infinity,-1,0,'120',null,undefined,10_000_001])('rejects malformed payload value %s rather than silently ignoring it',(value)=>{
    const config={mode:'what-if',maxPayloadKg:value} as unknown as LimitReviewConfig;
    const result=run({...container,limitReview:config});
    expect(result.placements).toEqual([]);expect(result.limitReview?.status).toBe('invalid');
    expect(result.limitReview?.errors.length).toBeGreaterThan(0);
    expect(result.remaining.reduce((s,r)=>s+r.quantity,0)).toBe(2);
  });
  it.each([{minimumSupportRatio:0},{minimumSupportRatio:.81},{cargoLimits:{missing:{maxStackLayers:2}}},{cargoLimits:{box:{maxStackLayers:2.5}}},{cargoLimits:{box:{maxTopLoadKg:-1}}},{simulation:{maxRotationDeg:181}},{simulation:{maxDisplacementMm:NaN}}] as Omit<LimitReviewConfig,'mode'>[])('rejects malformed scenario %j',config=>{
    expect(resolveLimitReview(review(container,config),[box]).status).toBe('invalid');
  });
  it('does not sanitize an invalid original rating by selecting a valid replacement',()=>{
    expect(run(review({...container,maxPayloadKg:NaN},{maxPayloadKg:2000})).limitReview?.status).toBe('invalid');
  });
  it('blocks review in A, pallet and MIXED entrypoints explicitly',()=>{
    const spec=review(container,{maxPayloadKg:2000});
    const a={...spec,rules:{version:'a-v1' as const,equipmentId:'test',kind:'container' as const,access:['rear' as const],source:'test'}};
    expect(run(a).limitReview?.status).toBe('unsupported');
    expect(packOnPallets(spec,[box]).limitReview?.status).toBe('unsupported');
    expect(packMixedMode(spec,[box]).limitReview?.status).toBe('unsupported');
  });
  it('keeps non-section-7 door errors visible with the WHAT-IF layout instead of suppressing it',()=>{
    const equipment:ContainerSpec={length:5.9,width:2.352,height:2.395,maxPayloadKg:28130};
    const items=[{...box,length:5.9,width:2.35,height:2.3,weightKg:100,quantity:1}];
    const result=run(review(equipment,{maxPayloadKg:50000}),items);
    expect(result.placements).toHaveLength(1);
    expect(result.operationalFindings?.some(f=>f.code==='DOOR_NOT_PASSABLE'&&f.severity==='error')).toBe(true);
    expect(result.operationalFindings?.some(f=>f.code==='LIMIT_REVIEW_BLOCKED')).toBe(false);
    expect(reviewPlacementBlockers(review(equipment,{maxPayloadKg:50000}),items,result.placements,result.securingBudget?.totalTransportWeightKg)).toEqual([]);
  });
  it('still blocks a strict unload conflict in WHAT-IF review',()=>{
    const stops=[{...box,id:'FIRST',quantity:1,unloadPriority:1},{...box,id:'LATER',quantity:1,unloadPriority:2}];
    const spec=review({...container,length:4,width:1,unloadingPolicy:'strict'},{maxPayloadKg:2000});
    const placements:Placement[]=[
      {cargoId:'FIRST',x:0,y:0,z:0,length:1,width:1,height:.5,weightKg:60},
      {cargoId:'LATER',x:2,y:0,z:0,length:1,width:1,height:.5,weightKg:60},
    ];
    expect(reviewPlacementBlockers(spec,stops,placements,130).some(message=>message.includes('하역'))).toBe(true);
  });
  it('round trips all metadata through JSON without Infinity or NaN',()=>{
    const result=run(review(container,{cargoLimits:{box:{maxTopLoadKg:1100}},simulation:{maxDisplacementMm:15,maxRotationDeg:2}}));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.limitReview?.config.simulation).toEqual({maxDisplacementMm:15,maxRotationDeg:2});
  });
});

const supportCargo:CargoItem[]=[{...box,id:'base',length:.9,width:.85,weightKg:60,quantity:1}, {...box,id:'top',weightKg:59,quantity:1}];
const supportSpec=review(container,{minimumSupportRatio:.75});
describe('review support remains real physical contact',()=>{
  it('allows explicitly selected partial-support auto candidates and retains original support errors',()=>{
    const strict=run(container,supportCargo),result=run(supportSpec,supportCargo);
    expect(strict.placements).toHaveLength(1);
    expect(result.placements).toHaveLength(2);
    expect(metric(result,'support')).toMatchObject({originalLimit:.8,scenarioLimit:.75,provenance:'app-default',direction:'minimum'});
    expect(metric(result,'support').actual).toBeCloseTo(.765);
    expect(metric(result,'support').excess).toBeCloseTo(.035);
    expect(result.validationIssues.some(i=>i.type==='UNSUPPORTED')).toBe(true);
    expect(result.operationalFindings?.some(f=>f.code==='INSUFFICIENT_SUPPORT'&&f.severity==='error')).toBe(true);
    expect(reviewPlacementBlockers(supportSpec,supportCargo,result.placements,result.securingBudget?.totalTransportWeightKg)).toEqual([]);
  });
  it('uses the same partial support limits in manual and group previews while keeping actual audits',()=>{
    const result=run(supportSpec,supportCargo);
    const top=result.placements.findIndex(p=>p.cargoId==='top');
    expect(top).toBeGreaterThanOrEqual(0);
    const p=result.placements[top];
    const manual=assessManualMove(supportSpec,supportCargo,result,top,p);
    expect(manual.valid).toBe(true);
    expect(manual.result.validationIssues.some(i=>i.type==='UNSUPPORTED')).toBe(true);
    const grouped=assessGroupMove(supportSpec,supportCargo,result,[0,1],{x:0,y:0,z:0});
    expect(grouped.valid).toBe(true);expect(grouped.result.limitReview?.status).toBe('active');
    expect(assessManualMove(container,supportCargo,result,top,p).valid).toBe(false);
  });
  it('never allows no contact, unsupported CG, collision or out-of-bounds',()=>{
    const result=run(supportSpec,supportCargo);
    const floated=result.placements.map(p=>p.cargoId==='top'?{...p,z:.7}:p);
    expect(reviewPlacementBlockers({...supportSpec,height:2},supportCargo,floated).some(s=>s.includes('지지'))).toBe(true);
    const overhang=result.placements.map(p=>p.cargoId==='top'?{...p,x:.6}:p);
    expect(reviewPlacementBlockers({...supportSpec,length:2},supportCargo,overhang).length).toBeGreaterThan(0);
    expect(reviewPlacementBlockers(supportSpec,supportCargo,result.placements.map(p=>({...p,x:99}))).length).toBeGreaterThan(0);
    const overlap=result.placements.map(p=>p.cargoId==='top'?{...p,z:0}:p);
    expect(reviewPlacementBlockers(supportSpec,supportCargo,overlap).length).toBeGreaterThan(0);
  });
});

describe('manual review preservation and strict restoration',()=>{
  it('permits selected-overload previews and refreshes original audit on restore',()=>{
    const spec=review({...container,maxPayloadKg:100},{maxPayloadKg:130});
    const result=run(spec);
    const assessed=assessManualMove(spec,[box],result,1,result.placements[1]);
    expect(assessed.valid).toBe(true);expect(assessed.result.validationIssues.some(i=>i.type==='PAYLOAD')).toBe(true);
    writeManualOverride(spec,[box],assessed.result);
    const restored=restoreLoadingResult(spec,[box]);
    expect(restored.placements).toEqual(result.placements);
    expect(restored.limitReview?.metrics).toEqual(result.limitReview?.metrics);
    expect(restored.validationIssues.some(i=>i.type==='PAYLOAD')).toBe(true);
  });
  it('expires fingerprints when review is changed or disabled and cannot resurrect unsafe saved geometry',()=>{
    const strict={...container,maxPayloadKg:100},spec=review(strict,{maxPayloadKg:130}),result=run(spec);
    writeManualOverride(spec,[box],result);
    expect(readManualOverride(spec,[box])?.limitReview).toEqual(result.limitReview);
    expect(readManualOverride(review(strict,{maxPayloadKg:140}),[box])).toBeNull();
    expect(readManualOverride(strict,[box])).toBeNull();
    expect(restoreLoadingResult(strict,[box],result).placements).toEqual([]);
  });
  it('expires strict saved plans on floor-limit or strength-provenance changes',()=>{
    const result=run(container);writeManualOverride(container,[box],result);
    expect(readManualOverride({...container,floorLoadLimitKgPerM2:100},[box])).toBeNull();
    expect(readManualOverride(container,[{...box,strengthUnverified:true}])).toBeNull();
  });
  it('checks the scenario budget again if the source securing level requires more material',()=>{
    const spec=review({...container,maxPayloadKg:100},{maxPayloadKg:130});
    const result=run(spec);result.securingBudget={...result.securingBudget!,level:3};
    expect(assessManualMove(spec,[box],result,1,result.placements[1]).valid).toBe(false);
  });
});

it('floor peak uses contact footprint, including partial vertical projection',()=>{
  const p:Placement={cargoId:'a',x:0,y:0,z:0,length:1,width:1,height:.5,weightKg:100};
  expect(actualPeakFloorLoad([p,{...p,x:.5,z:.5,weightKg:50}])).toBe(150);
  expect(actualPeakFloorLoad([p,{...p,x:1,z:.5,weightKg:50}])).toBe(100);
});
