import { createExternalStore } from './store/externalStore';
import { palletSpecForType, type PalletType } from './engine/palletCatalog';
import type { PalletSpec } from './engine/palletOptimization';

// Keep per-product job edits shared by estimates and the final loader. Switching
// through a pallet with unknown static capacity must not clamp another type.
const store = createExternalStore<Record<string, PalletSpec>>({});
export const readPalletJobSpecs = store.getSnapshot;
export const usePalletJobSpecs = store.useSnapshot;
export function palletJobSpec(type: PalletType, specs = readPalletJobSpecs()) {
  return specs[type.id] ?? palletSpecForType(type);
}
export function recordPalletJobSpec(typeId: string, spec: PalletSpec) {
  store.setSnapshot(current => ({ ...current, [typeId]: spec }));
}
