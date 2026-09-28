import { packOnPallets, type PalletSpec } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';
import type { LoadingStrategy } from './loadingEngine';
/** Initial and alternative plans contain bare pallets/cartons only. Finishing
 * materials are assigned by the transport certification after its unsecured gate. */
export function packUnsecuredPallets(
  container: ContainerSpec,
  cargo: CargoItem[],
  spec: PalletSpec,
  strategy: LoadingStrategy = 'capacity',
) {
  return packOnPallets(container, cargo, { ...spec, useWrapping: false, useCornerGuards: false }, strategy);
}
