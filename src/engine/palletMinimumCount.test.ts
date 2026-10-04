import { expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { centerPalletPlan } from './palletCentering';
import { validateAPlan } from './loadSimAdapter';
import type { CargoItem, ContainerSpec } from './types';

const cargo:CargoItem[]=[{id:'dense',name:'Registered stackable cartons',length:.5,width:.5,height:.38,weightKg:10,quantity:24,maxStackLayers:6,maxTopLoadKg:1000,allowRotation:false,unloadPriority:1}];
const container:ContainerSpec={length:12.03,width:2.35,height:2.69,maxPayloadKg:26500};

for(const strategy of ['capacity','stability','unloading'] as const) for(const minimizePackaging of [true,false]) {
  it(`${strategy}: minimizes pallet count before preferred load height (packaging=${minimizePackaging})`,()=>{
    const pallet={...defaultPalletSpec,length:1.2,width:1,height:.144,maxStackLevels:1,minimizePackaging};
    const result=packOnPallets(container,cargo,pallet,strategy);
    expect(result.placements).toHaveLength(24);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(1);
    expect(result.pallets[0].cargoWeightKg).toBeLessThanOrEqual(pallet.maxLoadKg);
    expect(Math.max(...result.placements.map(p=>p.z+p.height))).toBeLessThanOrEqual(container.height);
  });
}

it('retains declared carton limits even when they require more pallet bases',()=>{
  const restricted=cargo.map(item=>({...item,maxStackLayers:1,maxTopLoadKg:0}));
  const result=packOnPallets(container,restricted,{...defaultPalletSpec,length:1.2,width:1,maxStackLevels:1},'capacity');
  expect(result.placements).toHaveLength(24);
  expect(result.palletCount).toBe(6);
  expect(result.placements.every(p=>Math.abs(p.z-.15)<1e-8)).toBe(true);
});

it('minimizes A pallet bases while keeping final A clearances, support and load checks',()=>{
  const a:ContainerSpec={...container,rules:{version:'a-v1',equipmentId:'test',kind:'container',access:['rear'],door:{w:2340,h:2585},tareKg:0,source:'synthetic'}};
  const result=centerPalletPlan(packOnPallets(a,cargo,{...defaultPalletSpec,length:1.2,width:1,height:.144,maxStackLevels:1},'capacity'),a);
  expect(result.placements).toHaveLength(24);
  expect(result.palletCount).toBe(1);
  const supports=result.pallets.map(s=>({id:String(s.palletIndex),x:s.x,y:s.y,z:s.z,length:s.length,width:s.width,height:s.height,weightKg:s.totalWeightKg-s.cargoWeightKg,unitCenterOfGravity:s.centerOfGravity,unitHeightM:Math.max(s.height,...s.cargoPlacements.map(p=>p.z+p.height-s.z))+s.packagingExtraHeightM}));
  expect(validateAPlan(a,cargo,result.placements,supports).filter(f=>f.severity==='error')).toEqual([]);
});
