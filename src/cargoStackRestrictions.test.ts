import { expect, it } from 'vitest';
import { cargoStackRestrictions, stackLimitExplanation } from './cargoStackRestrictions';
import { palletRecommendationSignature } from './palletRecommendationInput';
import { cargoFromProductPackaging } from './productWorkflow';
import type { CargoItem } from './engine/types';

const cargo:CargoItem={id:'full',name:'Carton',length:1,width:1,height:1,weightKg:10,quantity:10,productId:'P',productName:'Product',boxId:'AUTO-P',maxStackLayers:1,maxTopLoadKg:0,stackLimitOrigin:{kind:'unverified-carton',maxStackLayers:1,maxTopLoadKg:0}};
it('groups full and residual packages without claiming two restricted products',()=>{
  const grouped=cargoStackRestrictions([cargo,{...cargo,id:'partial',quantity:1}]);
  expect(grouped).toHaveLength(1);expect(grouped[0].quantity).toBe(11);expect(grouped[0].rows).toBe(2);
  expect(grouped[0].reason).toContain('자동 제한');
});
it('does not attribute historical or changed limits to the operator or obsolete automatic origin',()=>{
  expect(stackLimitExplanation({...cargo,stackLimitOrigin:undefined})).toContain('출처 미기록');
  expect(stackLimitExplanation({...cargo,maxStackLayers:4})).toContain('출처 미기록');
});
it('records the conservative direct-product default at its actual source',()=>{
  const result=cargoFromProductPackaging([{id:'P',name:'P',length:.1,width:.1,height:.1,weightKg:1,quantity:2,requiresBoxPackaging:false}],[]);
  expect(result[0].stackLimitOrigin?.kind).toBe('direct-product');
  expect(stackLimitExplanation(result[0])).toContain('적층 정보 없음');
});
it('invalidates recommendation inputs on stop/handling/mixed changes',()=>{
  const state={container:{length:12,width:2.3,height:2.7,maxPayloadKg:26000},cargo:[cargo]};
  const initial=palletRecommendationSignature(state,'capacity');
  for(const change of [{unloadPriority:2},{mixedLoadingMethod:'direct' as const},{thisSideUp:true}]) expect(palletRecommendationSignature({...state,cargo:[{...cargo,...change}]},'capacity')).not.toBe(initial);
});
