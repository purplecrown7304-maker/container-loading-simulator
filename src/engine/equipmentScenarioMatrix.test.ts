import { describe, expect, it } from 'vitest';
import { TRANSPORT_EQUIPMENT } from '../transportEquipment';
import { loadContainer } from './loadingEngine';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { auditLoading } from './loadingAudit';
import { validatePlacements } from './constraints';
import type { CargoItem, Placement } from './types';

// Synthetic shipments only: catalog consistency does not certify real vehicle specifications.
const cargo: CargoItem[] = [
 {id:'FULL',name:'Synthetic full carton',length:.6,width:.4,height:.3,weightKg:14,quantity:4,maxStackLayers:3,maxTopLoadKg:50,allowRotation:true,unloadPriority:2,unitsPerPackage:6},
 {id:'PARTIAL',name:'Synthetic partial carton',length:.6,width:.4,height:.3,weightKg:4,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false,unloadPriority:1,unitsPerPackage:1},
 {id:'DIRECT',name:'Synthetic unpackaged item',length:.3,width:.2,height:.2,weightKg:2,quantity:2,maxStackLayers:2,maxTopLoadKg:10,allowRotation:false,unloadPriority:1,unitsPerPackage:1},
 {id:'OVERSIZE',name:'Synthetic rejected item',length:30,width:10,height:5,weightKg:100,quantity:1,maxStackLayers:1,allowRotation:false},
];
function conserved(placements:Placement[], remaining:{cargoId:string;quantity:number;reason:string}[]){
 expect(placements).toHaveLength(7);
 for(const item of cargo){const loaded=placements.filter(p=>p.cargoId===item.id).length;const waiting=remaining.filter(r=>r.cargoId===item.id).reduce((n,r)=>n+r.quantity,0);expect(loaded+waiting,item.id).toBe(item.quantity);}
 expect(new Set(placements.map(p=>[p.cargoId,p.x,p.y,p.z].join('|'))).size).toBe(placements.length);
 expect(remaining.every(r=>r.reason.trim().length>0)).toBe(true);
 expect(remaining.find(r=>r.cargoId==='OVERSIZE')?.quantity).toBe(1);
}
describe('all registered transport equipment: synthetic data and safety matrix',()=>{
 it('has unique identities and valid numerical master data, including specialized equipment',()=>{
  expect(new Set(TRANSPORT_EQUIPMENT.map(e=>e.id)).size).toBe(TRANSPORT_EQUIPMENT.length);
  for(const e of TRANSPORT_EQUIPMENT){expect(e.name.trim()).not.toBe('');for(const value of [e.length,e.width,e.height,e.maxPayloadKg,e.floorLoadLimitKgPerM2,...[e.doorWidth,e.doorHeight,e.volumeM3].filter((n):n is number=>n!==undefined)]){expect(Number.isFinite(value),e.id).toBe(true);expect(value,e.id).toBeGreaterThan(0);}if(e.specializedCargo)expect(e.note?.length).toBeGreaterThan(0);}
 });
 it.each(TRANSPORT_EQUIPMENT.filter(e=>!e.specializedCargo))('$id preserves quantities and constraints in both modes and all strategies',space=>{
  for(const strategy of ['capacity','stability','unloading'] as const){
   const direct=loadContainer(space,cargo,{strategy,publish:false});conserved(direct.placements,direct.remaining);expect(direct.validationIssues).toEqual([]);expect(auditLoading(space,cargo,direct.placements)).toEqual([]);
   const pallet=packOnPallets(space,cargo,defaultPalletSpec,strategy);conserved(pallet.placements,pallet.remaining);expect(validatePlacements(space,pallet.placements)).toEqual([]);expect(pallet.totalPalletizedWeightKg).toBeLessThanOrEqual(space.maxPayloadKg+1e-6);
   expect(pallet.pallets.flatMap(p=>p.cargoPlacements)).toHaveLength(pallet.placements.length);
   for(const p of pallet.pallets){expect(p.stackLevel).toBeLessThanOrEqual(defaultPalletSpec.maxStackLevels);expect(p.cargoWeightKg).toBeLessThanOrEqual(defaultPalletSpec.maxLoadKg);const local=p.cargoPlacements.map(b=>({...b,x:b.x-p.x,y:b.y-p.y,z:b.z-p.z-p.height}));expect(auditLoading({...space,length:p.length,width:p.width,height:space.height-p.z-p.height},cargo,local)).toEqual([]);}
  }
 });
});
