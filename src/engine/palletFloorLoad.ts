import { configuredFloorLoadLimit, placementsWithinFloorLoadLimit } from './floorLoadLimit';
import { isARules } from './loadingRuleset';
import type { PalletLoad, PalletSpec } from './palletPacking';
import type { ContainerSpec, Placement } from './types';

export function palletPackagingReserveKg(pallet: PalletSpec) {
  return (pallet.useCornerGuards ? pallet.cornerGuardWeightKg : 0)
    + (pallet.useWrapping ? pallet.wrappingWeightKg : 0);
}

export function palletFloorBody(load: Pick<PalletLoad, 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'packagingWeightKg'>,
  pallet: PalletSpec, reservePackaging = false): Placement {
  return { cargoId: '__PALLET_FLOOR_MASS__', x: load.x, y: load.y, z: load.z,
    length: load.length, width: load.width, height: load.height,
    weightKg: pallet.tareWeightKg + (reservePackaging ? palletPackagingReserveKg(pallet) : load.packagingWeightKg) };
}

/** Existing legacy exact vertical projection, including every deck's own mass.
 * Cargo retains its actual footprint; the deck is not a load-spreading plate. */
export function palletLoadsWithinFloorLoadLimit(container: ContainerSpec, loads: PalletLoad[], pallet: PalletSpec,
  reservePackaging = false) {
  if (isARules(container) || configuredFloorLoadLimit(container) === undefined) return true;
  return placementsWithinFloorLoadLimit(container,
    loads.flatMap(load => [...load.cargoPlacements, palletFloorBody(load, pallet, reservePackaging)]));
}

/** A uniform deck/tare density consumes the same part of the limit at every
 * point on this pallet. The remaining density budget is for actual cartons. */
export function palletCargoFloorLimit(container: ContainerSpec, pallet: PalletSpec) {
  const limit = isARules(container) ? undefined : configuredFloorLoadLimit(container);
  return limit === undefined ? undefined
    : limit - (pallet.tareWeightKg + palletPackagingReserveKg(pallet)) / (pallet.length * pallet.width);
}
