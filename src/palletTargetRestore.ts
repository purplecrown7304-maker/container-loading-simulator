import { validatePlacements } from './engine/constraints';
import { validateOperationalLoading } from './engine/operationalValidator';
import type { CargoItem, ContainerSpec } from './engine/types';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import { readPalletSnapshot } from './palletSnapshotStore';
import { palletModelKey } from './palletModel';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { PALLET_ADVISORY_CODES } from './engine/palletPlanValidation';

/**
 * The guided 3D viewer is intentionally unmounted after the automatic-loading step.
 * PalletModePanel clears its live physics target on unmount, but the verified pallet
 * snapshot is kept in palletSnapshotStore so result/report actions can restore the
 * exact same target without recalculating or changing the loading plan.
 */
export function buildPalletPhysicsTarget(container: ContainerSpec, cargo: CargoItem[]): PhysicsTarget | undefined {
  const snapshot = readPalletSnapshot();
  if (!snapshot) return undefined;

  const target = physicsTargetFromPalletSnapshot(container,cargo,snapshot);
  const supports = snapshot.result.pallets.map((pallet) => ({
    modelKey: palletModelKey(snapshot.spec),
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

  return { ...target, supports };
}

export function restorePalletPhysicsTarget(container: ContainerSpec, cargo: CargoItem[]): PhysicsTarget | undefined {
  const current = readPhysicsTarget();
  const restored = buildPalletPhysicsTarget(container, cargo);
  if (restored) {
    publishPhysicsTarget(restored);
    return restored;
  }
  // A live-only target may exist before the first persisted snapshot. Refresh
  // its hard findings too; missing cached findings never imply a valid layout.
  if (current?.mode === 'pallets') {
    const refreshed: PhysicsTarget = {...current,container,cargo,result:{...current.result,
      validationIssues:validatePlacements(container,current.result.placements),
      // Pallet advisories need the pallet build, which a live-only target does not carry: keep the ones it has.
      operationalFindings:[...validateOperationalLoading(container,cargo,current.result.placements,current.supports ?? []),
        ...(current.result.operationalFindings ?? []).filter(f=>(PALLET_ADVISORY_CODES as readonly string[]).includes(f.code))],
    }};
    publishPhysicsTarget(refreshed);
    return refreshed;
  }
  return undefined;
}
