import { describe, it, expect } from 'vitest';
import { auditAIdentity, expandCargo, fromAPlacement, packWithARules, toAItem, toASpace, validateAPlan } from './loadSimAdapter';
import { ALL_ORIENTATIONS } from './loadSimA/types';
import { loadContainer } from './loadingEngine';
import { pack } from './loadSimA/pack';
import { canPlace } from './loadSimA/validate';
import { assessManualMove } from './manualPlacement';
import { packOnPallets, defaultPalletSpec } from './palletOptimization';
import { centerPalletCargo } from './palletCentering';
import { packMixedMode } from './mixedModePacking';
import { optimizeLoadingWithPhysics } from './physicsOptimizer';
import { readManualOverride, writeManualOverride } from './manualOverride';
import type { CargoItem, ContainerSpec, Placement } from './types';

const c:ContainerSpec={length:6,width:2.4,height:2.4,maxPayloadKg:20000,rules:{version:'a-v1',equipmentId:'test',kind:'container',access:['rear'],door:{w:2350,h:2300},tareKg:2000,source:'test'}};
const box:CargoItem={id:'sku:with:delimiter',name:'Box',length:.6,width:.4,height:.3,weightKg:10,quantity:8};
const placed=(id:string,x:number,y:number,z:number):Placement=>({cargoId:id,x,y,z,length:.6,width:.4,height:.3,weightKg:10});

describe('A integration contracts',()=>{
 it('publishes securing demand in daN for every direction without making it a hard error',()=>{
   const p=placed(box.id,2.7,1,0);
   const warnings=validateAPlan(c,[box],[p]).filter(f=>f.code==='SECURING_FORCE');
   expect(warnings).toHaveLength(1);
   expect(warnings[0]).toMatchObject({severity:'warning',placementIndexes:[0]});
   expect(warnings[0].value).toBeCloseTo((.8-.45)*10*9.81/10);
   expect(warnings[0].message).toContain('전방 3.4daN, 후방 0.5daN, 측방 0.5daN');
   const side={...c,rules:{...c.rules!,config:{accel:{forward:.1,rearward:.2,sideways:.9}}}};
   expect(validateAPlan(side,[box],[p]).find(f=>f.code==='SECURING_FORCE')?.value).toBeCloseTo((.9-.45)*10*9.81/10);
   expect(validateAPlan(c,[{...box,friction:1}],[p]).some(f=>f.code==='SECURING_FORCE')).toBe(false);
 });
 it('counts transmitted stack mass once and maps pallet securing warnings back to its cartons',()=>{
   const stack=[placed(box.id,2.7,1,0),placed(box.id,2.7,1,.3)];
   const stackWarnings=validateAPlan(c,[box],stack).filter(f=>f.code==='SECURING_FORCE');
   expect(stackWarnings).toHaveLength(1);
   expect(stackWarnings[0].value).toBeCloseTo((.8-.45)*20*9.81/10);
   const support={id:'base',x:2.7,y:1,z:0,length:1.2,width:.4,height:.15,weightKg:25};
   const cartons=[placed(box.id,2.7,1,.15),placed(box.id,3.3,1,.15)];
   const warnings=validateAPlan(c,[box],cartons,[support]).filter(f=>f.code==='SECURING_FORCE');
   expect(warnings).toHaveLength(1);
   expect(warnings[0].placementIndexes).toEqual([0,1]);
   expect(warnings[0].value).toBeCloseTo((.8-.45)*45*9.81/10);
 });
 it('preserves individual identity and converts every orientation without quantizing coordinates',()=>{
   const {items,originals}=expandCargo([box]); expect(new Set(items.map(i=>i.id)).size).toBe(8);
   for(const orientation of ALL_ORIENTATIONS){
     const p=fromAPlacement({item:items[0],pos:{x:1234.567,y:200.125,z:0},orientation},originals.get(items[0].id)!);
     expect(p.x).toBeCloseTo(1.234567,10);expect(p.cargoId).toBe(box.id);
     expect(auditAIdentity(c,[box],[p])).toEqual([]);
   }
   expect(toASpace(c).inner).toEqual({l:6000,w:2400,h:2400});
 });
 it('keeps explicit no-rotation and protects original dimensions',()=>{
   const b={...box,allowRotation:false};
   const p=fromAPlacement({item:toAItem(b,'one'),pos:{x:0,y:0,z:0},orientation:'LHW'},b);
   expect(auditAIdentity(c,[b],[p]).map(i=>i.type)).toContain('INVALID_CARGO');
   expect(auditAIdentity(c,[box],[{...p,height:99}]).map(i=>i.type)).toContain('INVALID_CARGO');
 });
 it('retains lower-item stack protection and conservative transmitted loads',()=>{
   const b={...box,maxStackLayers:1,maxTopLoadKg:5};
   const issues=auditAIdentity(c,[b],[placed(box.id,0,0,0),placed(box.id,0,0,.3)]);
   expect(issues.map(i=>i.type)).toEqual(expect.arrayContaining(['STACK_LIMIT','TOP_LOAD']));
 });
 it('counts quantity and rejects duplicate instance IDs',()=>{
   const p={...placed(box.id,0,0,0),unitId:'same'};
   expect(auditAIdentity(c,[{...box,quantity:1}],[p,{...p,x:1}]).filter(i=>i.type==='QUANTITY').length).toBe(2);
 });
 it('keeps canPlace separate from final center-of-gravity validation',()=>{
   const a=toAItem(box,'one'), p={item:a,pos:{x:0,y:0,z:0},orientation:'LWH' as const};
   expect(canPlace([],p,toASpace(c))).toEqual([]);
   expect(validateAPlan(c,[box],[fromAPlacement(p,box)]).map(i=>i.code)).toContain('CG_LONGITUDINAL');
 });
 it('packs deterministically, keeps quantities and emits rule provenance',()=>{
   const one={...box,quantity:1};
   const a=loadContainer(c,[one],{publish:false,strategy:'capacity'}),b=loadContainer(c,[one],{publish:false,strategy:'capacity'});
   expect(a).toEqual(b);expect(a.ruleset).toBe('a-v1');
   expect(a.placements.length+a.remaining.reduce((s,r)=>s+r.quantity,0)).toBe(one.quantity);
   expect(a.operationalFindings?.filter(f=>f.severity==='error')).toEqual([]);
 });
 it('does not count enclosed cartons twice in vehicle payload and flags floating internal cargo',()=>{
   const p={...placed(box.id,2.7,1, .15)}, support={id:'pallet',x:2.7,y:1,z:0,length:.6,width:.4,height:.15,weightKg:25};
   const findings=validateAPlan({...c,maxPayloadKg:35},[box],[p],[support]);
   expect(findings.some(f=>f.code==='PAYLOAD_EXCEEDED')).toBe(false);
   expect(validateAPlan(c,[box],[{...p,z:.25}],[support]).map(f=>f.code)).toContain('FLOATING');
 });
 it('reports missing truck axle data rather than applying fictional presets',()=>{
   const t={...c,rules:{...c.rules!,kind:'truck' as const,tareKg:undefined}};
   expect(validateAPlan(t,[box],[placed(box.id,2.7,1,0)]).map(f=>f.code)).toEqual(expect.arrayContaining(['NOT_CHECKED_AXLES','NOT_CHECKED_GROSS']));
   expect(toASpace(t).axles).toBeUndefined();
 });
 it('revalidates a manual move and keeps six-axis orientation after horizontal rotation',()=>{
   const a=packWithARules(c,[{...box,quantity:1,allowedOrientations:['LHW','HLW']}]);
   const moved=assessManualMove(c,[{...box,quantity:1,allowedOrientations:['LHW','HLW']}],a,0,{x:0,y:0,z:0},true);
   expect(moved.candidate.orientation).toBe(a.placements[0].orientation==='LHW'?'HLW':'LHW');
   expect(moved.valid).toBe(false);expect(moved.result.operationalFindings?.some(f=>f.code==='CG_LONGITUDINAL')).toBe(true);
 });
 it('applies integration candidate rejection inside A packing',()=>{
   const a=pack([toAItem(box,'one')],toASpace(c),{acceptCandidate:()=>false});
   expect(a.placements).toEqual([]);expect(a.unplaced).toHaveLength(1);
 });
 it('preserves pallet construction and validates the centered transport envelope',()=>{
   const items=[{...box,length:.5,width:.5,quantity:16,maxStackLayers:4}];
   const result=centerPalletCargo(packOnPallets(c,items,{...defaultPalletSpec,maxStackLevels:1}),c);
   expect(result.placements.length+result.remaining.reduce((s,r)=>s+r.quantity,0)).toBe(16);
   expect(result.pallets.length).toBeGreaterThan(0);
   const supports=result.pallets.map(p=>({id:String(p.palletIndex),x:p.x,y:p.y,z:p.z,length:p.length,width:p.width,height:p.height,weightKg:p.totalWeightKg-p.cargoWeightKg,unitCenterOfGravity:p.centerOfGravity,unitHeightM:Math.max(p.height,...p.cargoPlacements.map(b=>b.z+b.height-p.z))+p.packagingExtraHeightM}));
   expect(validateAPlan(c,items,result.placements,supports).filter(f=>f.severity==='error')).toEqual([]);
   expect(result.pallets.every(p=>p.x+p.length<=c.length-.03+.0005)).toBe(true);
 });
 it('preserves mixed-mode quantities and the protected-pallet policy',()=>{
   const items=[{...box,length:.5,width:.5,quantity:8,maxStackLayers:2}];
   const r=packMixedMode(c,items,{...defaultPalletSpec,maxStackLevels:1});
   expect(r.placements.length+r.remaining.reduce((s,p)=>s+p.quantity,0)).toBe(8);
   expect(r.mixed.minPalletFillRatio).toBe(.7);
 });
 it('blocks final A hard errors before starting dynamic validation',async()=>{
   const container={...c,rules:{...c.rules!,config:{incompatiblePairs:[['food','chemical']] as [string,string][]}}};
   await expect(optimizeLoadingWithPhysics(container,[{...box,quantity:1,segregationClass:'food'},{...box,id:'chemical',quantity:1,segregationClass:'chemical'}],undefined,'capacity')).rejects.toThrow('A 규칙 최종 검사 실패');
 });
 it('expires legacy manual fingerprints that omit floor, provenance and review constraints',()=>{
   const legacy={...c,rules:undefined};
   const fingerprint=JSON.stringify({c:[c.length,c.width,c.height,c.maxPayloadKg],items:[box].map(i=>[i.id,i.length,i.width,i.height,i.weightKg,i.quantity,i.maxStackLayers??null,i.maxTopLoadKg??null,i.allowRotation!==false,i.unloadPriority??null])});
   const result={placements:[],remaining:[],validationIssues:[],loadedWeightKg:0,usedVolumeM3:0};
   sessionStorage.setItem('container-loading-manual-override-v1',JSON.stringify({fingerprint,result}));
   // Old snapshots did not identify all safety constraints. They must be
   // recalculated rather than migrated into an accepted current layout.
   expect(readManualOverride(legacy,[box])).toBeNull();
   expect(readManualOverride({...legacy,floorLoadLimitKgPerM2:1500},[box])).toBeNull();
   expect(readManualOverride({...legacy,limitReview:{mode:'what-if',maxPayloadKg:30000}},[box])).toBeNull();
   expect(readManualOverride(c,[box])).toBeNull();
   sessionStorage.removeItem('container-loading-manual-override-v1');
 });
 it('round trips newly validated legacy and A snapshots with full constraint fingerprints',()=>{
   const legacy={...c,rules:undefined};
   const result={placements:[],remaining:[],validationIssues:[],loadedWeightKg:0,usedVolumeM3:0};
   for(const container of [legacy,c]) {
     writeManualOverride(container,[box],result);
     expect(readManualOverride(container,[box])).toEqual(result);
     expect(readManualOverride({...container,floorLoadLimitKgPerM2:1500},[box])).toBeNull();
     expect(readManualOverride(container,[{...box,strengthUnverified:true}])).toBeNull();
   }
   sessionStorage.removeItem('container-loading-manual-override-v1');
 });
});
