import type { PalletLoad } from './engine/palletOptimization';
import type { Placement } from './engine/types';
import { buildWorkInstructionAddresses } from './workInstructionGrid';

/** Vehicle floor addresses belong to stable C stacks; physical pallet tiers remain stackLevel.
 * Different cargo heights must never renumber a neighboring stack's second pallet as tier 3.
 */
export function buildPalletVehicleAddresses(pallets: readonly PalletLoad[]) {
  const bases = new Map<number, PalletLoad>();
  for (const pallet of pallets) {
    const previous = bases.get(pallet.stackColumn);
    if (!previous || pallet.stackLevel < previous.stackLevel
      || (pallet.stackLevel === previous.stackLevel && pallet.palletIndex < previous.palletIndex)) {
      bases.set(pallet.stackColumn, pallet);
    }
  }
  const floor = [...bases.values()];
  const addresses = buildWorkInstructionAddresses(floor.map(pallet => ({ x: pallet.x, y: pallet.y, z: 0 })));
  const byStack = new Map(floor.map((pallet, index) => [pallet.stackColumn, addresses[index]]));
  return new Map(pallets.map(pallet => [pallet.palletIndex, { ...byStack.get(pallet.stackColumn)!, layer: pallet.stackLevel }]));
}

/** Assembly coordinates are local to this pallet's deck, regardless of its vehicle stack tier. */
export function palletAssemblyPlacements(pallet: PalletLoad): Placement[] {
  return pallet.cargoPlacements.map(item => ({
    ...item, x: item.x - pallet.x, y: item.y - pallet.y, z: item.z - pallet.z - pallet.height,
  }));
}
