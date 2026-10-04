import type { OptimizedPalletPackingResult } from './palletOptimization';
import type { ContainerSpec } from './types';

let nextOverride: OptimizedPalletPackingResult | null = null;

/** Preserve an explicitly accepted result exactly through a UI refresh. */
export function setNextPalletCenteredResultOverride(result: OptimizedPalletPackingResult) {
  nextOverride = result;
}

export function consumeNextPalletCenteredResultOverride() {
  const result = nextOverride;
  nextOverride = null;
  return result;
}

/** Compatibility name only: A already centers and validates its layout; never transform it again. */
export function centerPalletCargo(result: OptimizedPalletPackingResult, _container: ContainerSpec): OptimizedPalletPackingResult {
  return consumeNextPalletCenteredResultOverride() ?? result;
}
