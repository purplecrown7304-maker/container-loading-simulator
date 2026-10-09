import type { CargoItem, ContainerSpec, Placement } from './types';

/** STEP04 displays missing stops as 1; both engines must use that same default. */
export function cargoWithUnloadingPolicy(container: ContainerSpec, cargo: CargoItem[]) {
  return container.unloadingPolicy ? cargo.map(item=>item.unloadPriority == null ? {...item,unloadPriority:1} : item) : cargo;
}

/** +X is the rear door in the legacy engine. Check a newly proposed rigid block. */
export function blocksUnloadPath(a: Placement, b: Placement, cargo: Map<string, CargoItem>) {
  const first = cargo.get(a.cargoId)?.unloadPriority ?? 1;
  const later = cargo.get(b.cargoId)?.unloadPriority ?? 1;
  if (later <= first) return false;
  const overlaps = (s: number, n: number, t: number, m: number) => Math.min(s+n,t+m) - Math.max(s,t) > 1e-6;
  const y = overlaps(a.y,a.width,b.y,b.width);
  return y && ((overlaps(a.z,a.height,b.z,b.height) && b.x >= a.x+a.length-1e-6)
    || (overlaps(a.x,a.length,b.x,b.length) && b.z >= a.z+a.height-.0015));
}

/**
 * True when every cargo id resolves to the same stop. `blocksUnloadPath` needs a strictly later
 * stop, so no pair can block and the pairwise scan is skipped. Ids missing from the map use the
 * same default stop (1) as `blocksUnloadPath`.
 */
function singleUnloadStop(cargo: Map<string, CargoItem>) {
  for (const item of cargo.values()) if ((item.unloadPriority ?? 1) !== 1) return false;
  return true;
}

export function acceptsUnloadCandidate(container: ContainerSpec, cargo: Map<string, CargoItem>, placements: Placement[], candidate: Placement) {
  if (container.unloadingPolicy !== 'strict' || singleUnloadStop(cargo)) return true;
  return !placements.some(p => blocksUnloadPath(p,candidate,cargo) || blocksUnloadPath(candidate,p,cargo));
}

/** Deck construction groups stops under strict handling while the outer scorer keeps its objective. */
export function palletBuildStrategy(container: ContainerSpec, strategy: 'capacity' | 'stability' | 'unloading') {
  if (container.unloadingPolicy === 'strict') return 'unloading';
  return container.unloadingPolicy === 'soft' && strategy === 'unloading' ? 'capacity' : strategy;
}
