import { packOnPallets } from './palletOptimization';
import { centerPalletCargo } from './palletCentering';
import { packMixedMode } from './mixedModePacking';
import type { PalletSpec } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';
import type { LoadingStrategy } from './loadingEngine';
self.onmessage=(event:MessageEvent<{container:ContainerSpec;cargo:CargoItem[];spec:PalletSpec;mode:'pallets'|'mixed';strategy:LoadingStrategy}>)=>{
  try {
    const {container,cargo,spec,mode,strategy}=event.data;
    const result=mode==='mixed'?packMixedMode(container,cargo,spec,strategy):centerPalletCargo(packOnPallets(container,cargo,spec,strategy),container);
    self.postMessage({result});
  }catch(error){self.postMessage({error:String(error)});}
};
