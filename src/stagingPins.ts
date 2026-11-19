import { createExternalStore } from './store/externalStore';
import type { PalletLoad } from './engine/palletPacking';

/** Pallets the operator has put in place by hand and wants kept there when automatic
 * loading is run again (owner instruction 2026-11-19).
 *
 * A pin is the place and the content of a pallet, not an identity: a calculation numbers
 * every carton afresh, but a pallet it leaves alone is still the same cartons at the same
 * coordinates. Pins belong to one input (`inputKey`) and are held for the session only;
 * a changed input, a reset or a reload forgets them and automatic loading plans freely. */
export type StagingPins = { inputKey: string; keys: readonly string[] };

const store = createExternalStore<StagingPins>({ inputKey: '', keys: [] });
export const readStagingPins = store.getSnapshot;
export const useStagingPins = store.useSnapshot;

const mm = (value: number) => Math.round(value * 1000);

/** The same pallet standing in the same place gives the same key, whatever its cartons
 * are called at the moment. */
export function palletPinKey(load: Pick<PalletLoad, 'x' | 'y' | 'z' | 'cargoPlacements'>): string {
  const cartons = load.cargoPlacements.map(p => [p.cargoId, mm(p.x), mm(p.y), mm(p.z), mm(p.length), mm(p.width), mm(p.height)].join(',')).sort();
  return JSON.stringify([mm(load.x), mm(load.y), mm(load.z), cartons]);
}

/** The pins that hold for this input; none if they were made for another one. */
export function stagingPinKeys(pins: StagingPins, inputKey: string): readonly string[] {
  return pins.inputKey === inputKey ? pins.keys : [];
}

export function setStagingPins(inputKey: string, keys: Iterable<string>) {
  const next = [...new Set(keys)].sort();
  store.setSnapshot(current => current.inputKey === inputKey && current.keys.length === next.length && current.keys.every((key, index) => key === next[index])
    ? current : { inputKey, keys: next });
}

export function clearStagingPins() { store.setSnapshot(current => current.keys.length || current.inputKey ? { inputKey: '', keys: [] } : current); }

const overlapsFloor = (a: PalletLoad, b: PalletLoad) => a.x < b.x + b.length - 1e-6 && b.x < a.x + a.length - 1e-6 && a.y < b.y + b.width - 1e-6 && b.y < a.y + a.width - 1e-6;

/** The pallets of the current plan that automatic loading has to leave where they are:
 * the pinned ones, and every pallet a pinned one stands on. In plan order. */
export function fixedPalletsFor(keys: readonly string[], pallets: readonly PalletLoad[]): PalletLoad[] {
  if (!keys.length || !pallets.length) return [];
  const wanted = new Set(keys);
  const fixed = new Set(pallets.filter(load => wanted.has(palletPinKey(load))));
  for (const pinned of [...fixed]) for (const load of pallets) if (load.z < pinned.z - 1e-6 && overlapsFloor(load, pinned)) fixed.add(load);
  return pallets.filter(load => fixed.has(load));
}

/** The keys that still name a pallet of this plan; the others have nothing left to hold. */
export function livingPinKeys(keys: readonly string[], pallets: readonly PalletLoad[]): string[] {
  if (!keys.length) return [];
  const present = new Set(pallets.map(palletPinKey));
  return keys.filter(key => present.has(key));
}
