import type { SecuringMaterialSettings } from '../securingMaterialSettings';
import type { CargoItem, ContainerSpec } from './types';

export type BoxSecuringLevel = 1 | 2 | 3;

/** One source of truth for direct-box material quantities in planning and certification. */
export function boxSecuringRequirements(count: number, level: BoxSecuringLevel, weights: SecuringMaterialSettings) {
  if (count <= 0) return { antiSlipMats: 0, dunnageBlocks: 0, loadBars: 0, weightKg: 0 };
  const antiSlipMats = Math.max(2, Math.ceil(count / (level === 1 ? 30 : 20)));
  const dunnageBlocks = Math.max(level === 1 ? 2 : level === 2 ? 4 : 6, Math.ceil(count / 80) * 2);
  const loadBars = level >= 2 ? 2 : 0;
  return { antiSlipMats, dunnageBlocks, loadBars,
    weightKg: antiSlipMats * weights.antiSlipKgPerEa + dunnageBlocks * weights.dunnageKgPerEa + loadBars * weights.loadBarKgPerEa };
}

/** Maximum count under the most optimistic unit-weight order INCLUDING materials.
 * This is only a cap for iterative budgeting, never a reserve charged for unplaced cargo. */
export function boxSecuringCapacity(container: ContainerSpec, cargo: CargoItem[], level: BoxSecuringLevel, weights: SecuringMaterialSettings) {
  let cargoWeight = 0;
  let count = 0;
  for (const item of [...cargo].filter(c => c.weightKg > 0 && Number.isFinite(c.weightKg) && Number.isInteger(c.quantity) && c.quantity > 0)
    .sort((a, b) => a.weightKg - b.weightKg || a.id.localeCompare(b.id))) {
    let low = 0, high = item.quantity;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const gross = cargoWeight + mid * item.weightKg + boxSecuringRequirements(count + mid, level, weights).weightKg;
      if (gross <= container.maxPayloadKg + 1e-9) low = mid; else high = mid - 1;
    }
    count += low;
    cargoWeight += low * item.weightKg;
  }
  return { maxCount: count, weightKg: boxSecuringRequirements(count, level, weights).weightKg };
}

export function boxSecuringBudget(container: ContainerSpec, cargo: CargoItem[], level: BoxSecuringLevel, weights: SecuringMaterialSettings) {
  return boxSecuringCapacity(container, cargo, level, weights).weightKg;
}
