import { expect, it } from 'vitest';
import { calculateLoadingForecast } from './loadingForecast';
import { defaultPalletSpec } from './palletOptimization';
import { loadContainer } from './loadingEngine';

it('forecast horizontal deviation includes declared carton CG offsets in millimetres',()=>{
  const container={length:3,width:2,height:2,maxPayloadKg:1000};
  const cargo=[{id:'A',name:'A',length:1,width:1,height:1,weightKg:10,quantity:1,allowRotation:false,cgOffsetMm:{l:100,w:50,h:0}}];
  const p=loadContainer(container,cargo,{strategy:'capacity',publish:false}).placements[0];
  const result=calculateLoadingForecast({container,cargo,mode:'boxes',pallet:defaultPalletSpec},'capacity');
  expect(result.cogDeviationMm).toBeCloseTo(Math.hypot((p.x+.5)*1000+100-1500,(p.y+.5)*1000+50-1000),6);
});
