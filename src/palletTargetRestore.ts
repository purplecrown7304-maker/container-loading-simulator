import { validatePlacements } from './engine/constraints';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { readPalletSnapshot } from './palletSnapshotStore';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

/**
 * The guided 3D viewer is intentionally unmounted after the automatic-loading step.
 * PalletModePanel clears its live physics target on unmount, but the verified pallet
 * snapshot is kept in palletSnapshotStore so result/report actions can restore the
 * exact same target without recalculating or changing the loading plan.
 */
export function buildPalletPhysicsTarget(container: ContainerSpec, cargo: CargoItem[]): PhysicsTarget | undefined {
  const snapshot = readPalletSnapshot();
  if (!snapshot) return undefined;

  const placements = snapshot.result.placements;
  const result: LoadingResult = {
    placements,
    remaining: snapshot.result.remaining,
    loadedWeightKg: snapshot.result.totalPalletizedWeightKg,
    usedVolumeM3: placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
    validationIssues: validatePlacements(container, placements),
  };
  const supports = snapshot.result.pallets.map((pallet) => ({
    id: `PALLET-${String(pallet.palletIndex).padStart(2, '0')}`,
    x: pallet.x,
    y: pallet.y,
    z: pallet.z,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    weightKg: Math.max(0.01, pallet.totalWeightKg - pallet.cargoWeightKg),
    dynamic: true,
  }));

  return { mode: 'pallets', container, cargo, result, supports };
}

export function restorePalletPhysicsTarget(container: ContainerSpec, cargo: CargoItem[]): PhysicsTarget | undefined {
  const current = readPhysicsTarget();
  if (current?.mode === 'pallets') return current;
  const restored = buildPalletPhysicsTarget(container, cargo);
  if (restored) publishPhysicsTarget(restored);
  return restored;
}
