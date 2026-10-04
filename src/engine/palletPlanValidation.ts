import type { PalletPackingResult } from './palletPacking';

/** Shared pallet bodies for final static checks and STEP04 estimates. */
export function palletSupportBodies(result: PalletPackingResult) {
  return result.pallets.map(s=>({ id:String(s.palletIndex), x:s.x,y:s.y,z:s.z,length:s.length,width:s.width,height:s.height,
    weightKg:s.totalWeightKg-s.cargoWeightKg,unitCenterOfGravity:s.centerOfGravity,
    unitHeightM:Math.max(s.height,...s.cargoPlacements.map(p=>p.z+p.height-s.z))+s.packagingExtraHeightM }));
}
