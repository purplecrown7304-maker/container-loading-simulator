import type { PalletSpec } from './engine/palletPacking';

/** Legacy/custom specifications retain the original wooden visual. */
export function palletModelKey(spec: Pick<PalletSpec, 'material'>) {
  return spec.material === 'plastic' ? 'plastic-pallet' as const : 'wood-pallet' as const;
}
