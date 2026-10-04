import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadContainer } from './loadingEngine';
import { auditLoading } from './loadingAudit';
import { validateOperationalLoading } from './operationalValidator';
import { packOnPallets, defaultPalletSpec } from './palletOptimization';
import { packMixedMode } from './mixedModePacking';
import { centerPalletPlan } from './palletCentering';
import type { CargoItem, ContainerSpec, Placement } from './types';

// Both engines receive independent copies of the same physical input.
// Only the rules context changes; these are synthetic boundary fixtures, not truck specifications.
const space:ContainerSpec={length:2,width:1.5,height:1.5,maxPayloadKg:1000};
const context:NonNullable<ContainerSpec['rules']>={version:'a-v1',equipmentId:'comparison-fixture',kind:'container',access:['rear'],door:{w:1500,h:1500},tareKg:0,source:'synthetic comparison fixture'};
const box:CargoItem={id:'box',name:'Comparison box',length:.5,width:.5,height:.5,weightKg:10,quantity:4,allowRotation:false};
type Fixture={id:string;reason:string;container?:Partial<ContainerSpec>;cargo:CargoItem[];rules?:Partial<typeof context>};
const fixtures:Fixture[]=[
 {id:'ordinary',reason:'일반 소량 화물의 기준 사례',cargo:[box]},
 {id:'exact-width',reason:'기존 벽면 밀착 허용과 A 폭 여유 20mm 차이',cargo:[{...box,width:1.5,quantity:1}]},
 {id:'exact-height',reason:'기존 천장 밀착 허용과 A 높이 여유 30mm 차이',cargo:[{...box,height:1.5,quantity:1}]},
 {id:'six-orientations',reason:'높이 방향 전환이 필요한 화물; 기존 수평 2방향과 A 6방향 차이',cargo:[{...box,length:1.6,width:.4,height:.8,quantity:1,allowRotation:true}],container:{length:1.2,width:1,height:2},rules:{door:{w:1000,h:2000}}},
 {id:'rotation-forbidden',reason:'명시적인 회전 금지는 두 엔진에서 보존',cargo:[{...box,length:1.6,width:.4,height:.8,quantity:1}],container:{length:1.2,width:1,height:2}},
 {id:'payload',reason:'총중량 제한 보존; 요청 4개 중 최대 2개',cargo:[{...box,weightKg:60}],container:{maxPayloadKg:125}},
 {id:'floor-only',reason:'바닥 전용 메타데이터의 실제 처리 차이와 공간 여유의 영향',cargo:[{...box,quantity:16,floorOnly:true}]},
 {id:'single-tier',reason:'기존 하부 화물 최대 적층 단계 보존',cargo:[{...box,quantity:16,maxStackLayers:1}]},
 {id:'zero-top-load',reason:'기존 보수적인 상부하중 제한 보존',cargo:[{...box,quantity:16,maxTopLoadKg:0}]},
 {id:'door-height',reason:'컨테이너 내부에는 들어가지만 실제 문 높이는 통과하지 못하는 화물',cargo:[{...box,height:1.1,quantity:1}],rules:{door:{w:1500,h:1000}}},
 {id:'segregation',reason:'A에 전달한 혼재금지 그룹 조합; 기존 엔진에는 해당 입력 규칙 없음',cargo:[{...box,id:'food',quantity:1,segregationClass:'food'},{...box,id:'chemical',quantity:1,segregationClass:'chemical'}],rules:{config:{incompatiblePairs:[['food','chemical']]}}},
 {id:'temperature',reason:'서로 다른 온도 구역 화물의 A 검증',cargo:[{...box,id:'cold',quantity:1,tempZone:'cold'},{...box,id:'ambient',quantity:1,tempZone:'ambient'}]},
 {id:'line-load',reason:'A 선하중 상한과 기존 면적하중 구분',cargo:[{...box,weightKg:100,quantity:1}],rules:{floorLineLoadKgPerM:50}},
 {id:'missing-truck-axles',reason:'가상 축 데이터를 적용하지 않고 미검증 표시',cargo:[{...box,quantity:1}],rules:{kind:'truck',tareKg:undefined}},
];
const rows:unknown[]=[];
function versions(f:Fixture){const legacy={...space,...f.container,rules:undefined};return {legacy,a:{...legacy,rules:{...context,...f.rules}}};}
function evaluate(c:ContainerSpec,cargo:CargoItem[],placements:Placement[]){
 const audit=auditLoading(c,cargo,placements);
 const findings=validateOperationalLoading(c,cargo,placements);
 return {valid:audit.length===0&&!findings.some(f=>f.severity==='error'),audit:[...new Set(audit.map(x=>x.type))].sort(),errors:[...new Set(findings.filter(f=>f.severity==='error').map(f=>f.code))].sort(),warnings:[...new Set(findings.filter(f=>f.severity!=='error').map(f=>f.code))].sort()};
}
describe('legacy versus A: identical cargo differential contract',()=>{
 for(const f of fixtures)it(f.id,()=>{
   const inputs=structuredClone(f);const paired=versions(inputs);
   const result=Object.fromEntries(Object.entries(paired).map(([key,c])=>{
     const cargo=structuredClone(inputs.cargo);const before=JSON.stringify({c,cargo});
     const r=loadContainer(c,cargo,{publish:false,strategy:'capacity'});
     expect(loadContainer(c,cargo,{publish:false,strategy:'capacity'})).toEqual(r);
     expect(JSON.stringify({c,cargo})).toBe(before);
     const requested=cargo.reduce((n,i)=>n+i.quantity,0),remaining=r.remaining.reduce((n,i)=>n+i.quantity,0);
     expect(r.placements.length+remaining).toBe(requested);
     const checks=evaluate(c,cargo,r.placements);
     return [key,{placed:r.placements.length,elevated:r.placements.filter(p=>p.z>0.005).length,remaining,allRequestedAccepted:remaining===0&&checks.valid,...checks}];
   }));
   rows.push({kind:'packing',id:f.id,reason:f.reason,input:f,result});
   expect(result).toMatchSnapshot();
 });

 // The same explicit placements distinguish validation changes from search heuristics.
 const probeBox={...box,quantity:2};
 const p=(x:number,y:number,z:number):Placement=>({cargoId:'box',x,y,z,length:.5,width:.5,height:.5,weightKg:10});
 const probes=[
   {id:'centered',reason:'중앙 단일 상자 기준',placements:[p(.75,.5,0)]},
   {id:'off-center',reason:'길이 무게중심 편차의 오류/경고 처리',placements:[p(0,0,0)]},
   {id:'overlap-0.2mm',reason:'기존 0.001mm와 A 0.5mm 충돌 허용오차 경계',placements:[p(.5,.5,0),p(.9998,.5,0)]},
   {id:'support-70pct',reason:'기존 후보 지지율과 최종 운영 지지율을 구분',placements:[p(.6,.5,0),p(.75,.5,.5)]},
   {id:'vertical-gap-3mm',reason:'기존 구조 지지 높이 허용오차와 A 5mm 차이',placements:[p(.75,.5,0),p(.75,.5,.503)]},
   {id:'top-load-protected',reason:'A에도 기존 상부하중 제한 유지',placements:[p(.75,.5,0),p(.75,.5,.5)],cargo:{...probeBox,maxTopLoadKg:5}},
 ];
 for(const f of probes)it(`validation/${f.id}`,()=>{
   const paired=versions({id:f.id,reason:f.reason,cargo:[f.cargo??probeBox]});
   const result=Object.fromEntries(Object.entries(paired).map(([key,c])=>[key,evaluate(c,[f.cargo??probeBox],structuredClone(f.placements))]));
   rows.push({kind:'validation',id:f.id,reason:f.reason,input:f,result});
   expect(result).toMatchSnapshot();
 });
 for(const mode of ['pallet','mixed','pallet-door'] as const)it(`packing/${mode}`,()=>{
   const f:Fixture={id:mode,reason:mode==='pallet-door'?'적재된 팔레트 전체 높이의 문 통과 검사':'동일 팔레트 구성 및 70% 혼합 정책 비교',container:{length:6,width:2.4,height:2.4},cargo:[{...box,quantity:16,maxStackLayers:4}],rules:{door:{w:2350,h:mode==='pallet-door'?1500:2300}}};
   const result=Object.fromEntries(Object.entries(versions(f)).map(([key,c])=>{
     const pallet={...defaultPalletSpec,maxStackLevels:1};
     const run=()=>centerPalletPlan(mode==='mixed'?packMixedMode(c,f.cargo,pallet):packOnPallets(c,f.cargo,pallet),c);
     const r=run();expect(run()).toEqual(r);
     const supports=r.pallets.map(p=>({id:String(p.palletIndex),x:p.x,y:p.y,z:p.z,length:p.length,width:p.width,height:p.height,weightKg:p.totalWeightKg-p.cargoWeightKg,unitCenterOfGravity:p.centerOfGravity,unitHeightM:Math.max(p.height,...p.cargoPlacements.map(b=>b.z+b.height-p.z))+p.packagingExtraHeightM}));
     const findings=validateOperationalLoading(c,f.cargo,r.placements,supports);
     const remaining=r.remaining.reduce((n,i)=>n+i.quantity,0);expect(r.placements.length+remaining).toBe(16);
     const errors=[...new Set(findings.filter(v=>v.severity==='error').map(v=>v.code))].sort();
     return [key,{placed:r.placements.length,pallets:r.pallets.length,remaining,allRequestedAccepted:!remaining&&!errors.length,valid:!errors.length,audit:[],errors,warnings:[...new Set(findings.filter(v=>v.severity!=='error').map(v=>v.code))].sort()}];
   }));
   rows.push({kind:'packing',id:mode,reason:f.reason,input:f,result});expect(result).toMatchSnapshot();
 });
});
afterAll(()=>{if(process.env.RULES_COMPARISON_REPORT)writeFileSync(process.env.RULES_COMPARISON_REPORT,JSON.stringify(rows,null,2));});
