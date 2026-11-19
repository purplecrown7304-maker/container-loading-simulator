import { packOnPalletsAroundFixed } from './palletFixedArrangement';
import { packMixedMode } from './mixedModePacking';
import type { PalletLoad, PalletSpec } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';
import type { LoadingStrategy } from './loadingEngine';
/** `fixed`: pallets the operator put in place by hand, kept there in pallet mode. */
self.onmessage=(event:MessageEvent<{container:ContainerSpec;cargo:CargoItem[];spec:PalletSpec;mode:'pallets'|'mixed';strategy:LoadingStrategy;fixed?:PalletLoad[]}>)=>{
  try {
    const {container,cargo,spec,mode,strategy,fixed}=event.data;
    const result=mode==='mixed'?packMixedMode(container,cargo,spec,strategy):packOnPalletsAroundFixed(container,cargo,spec,strategy,fixed??[]);
    self.postMessage({result});
  }catch(error){self.postMessage({error:String(error)});}
};
