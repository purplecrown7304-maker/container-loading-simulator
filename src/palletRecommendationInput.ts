import type { StoredState } from './storage';
import { readPalletJobSpecs } from './palletJobSpecs';

/** Include stop order, handling attributes and rule configuration as well as dimensions. */
export function palletRecommendationSignature(state: StoredState | null, strategy: string, mode: 'pallets' | 'mixed' = 'pallets') {
  if (!state) return null;
  const cargo = state.cargo.filter(item => item.quantity > 0);
  return cargo.length ? JSON.stringify([state.container, cargo, strategy, mode, readPalletJobSpecs()]) : null;
}
