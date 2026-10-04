import { expect, it } from 'vitest';
import { findPalletType } from './engine/palletCatalog';
import { palletJobSpec, recordPalletJobSpec } from './palletJobSpecs';
import { evaluatePalletType } from './engine/palletRecommendation';

it('switching through unknown static capacity does not clamp other pallet types; forecasts use job edits',()=>{
  const unknown=findPalletType('t12-wood-epal3')!;
  const known=findPalletType('t11-wood')!;
  const original=palletJobSpec(known);
  expect(palletJobSpec(unknown).maxStackLevels).toBe(1);
  expect(palletJobSpec(known)).toEqual(original);
  const edited={...palletJobSpec(unknown),maxLoadKg:20};
  recordPalletJobSpec(unknown.id,edited);
  const cargo=[{id:'A',name:'A',length:.5,width:.5,height:.38,quantity:24,weightKg:10,maxStackLayers:6,maxTopLoadKg:1000}];
  const c={length:12.03,width:2.35,height:2.69,maxPayloadKg:26500};
  const normal=evaluatePalletType(c,cargo,unknown,'capacity');
  const custom=evaluatePalletType(c,cargo,unknown,'capacity',undefined,'pallets',palletJobSpec(unknown));
  expect(normal.palletCount).toBe(1);
  expect(custom.palletCount).toBeGreaterThan(normal.palletCount);
  expect(palletJobSpec(known)).toEqual(original);
});
