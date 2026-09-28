import { expect,it } from 'vitest';
import { defaultPalletSpec } from './palletOptimization';
import { packUnsecuredPallets } from './unsecuredPalletPlan';
import { auditLoading } from './loadingAudit';
it.each(['capacity','stability','unloading'] as const)('plans bare cargo before finishing materials: %s',strategy=>{
 const space={length:1,width:1,height:.35,maxPayloadKg:95};
 const cargo=[{id:'BARE',name:'Bare carton',length:1,width:1,height:.2,weightKg:70,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false}];
 const spec={...defaultPalletSpec,length:1,width:1,height:.15,maxStackLevels:1,useWrapping:true,useCornerGuards:true,minimizePackaging:false};
 const before=JSON.stringify(spec);const result=packUnsecuredPallets(space,cargo,spec,strategy);
 expect(JSON.stringify(spec)).toBe(before);expect(result.placements).toHaveLength(1);expect(result.remaining).toEqual([]);expect(result.totalPackagingWeightKg).toBe(0);expect(result.totalPalletizedWeightKg).toBe(95);
 expect(result.pallets[0].wrappingUsed).toBe(false);expect(result.pallets[0].cornerGuardsUsed).toBe(false);
 expect(auditLoading({...space,height:.2},cargo,result.placements.map(p=>({...p,z:p.z-.15})))).toEqual([]);
});
it('still rejects cargo heavier than the bare pallet payload allowance',()=>{
 const spec={...defaultPalletSpec,length:1,width:1,height:.15,useWrapping:true};
 const result=packUnsecuredPallets({length:1,width:1,height:2,maxPayloadKg:94},[{id:'A',name:'A',length:1,width:1,height:.2,weightKg:70,quantity:1}],spec);
 expect(result.placements).toHaveLength(0);expect(result.remaining[0].quantity).toBe(1);expect(result.remaining[0].reason).toContain('중량');
});
