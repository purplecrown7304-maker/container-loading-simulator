import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

const EPS = 1e-9;

export type CertifiedPalletSnapshot = {
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
};

export function physicsTargetFromPalletSnapshot(
  container: ContainerSpec,
  cargo: CargoItem[],
  snapshot: CertifiedPalletSnapshot,
): PhysicsTarget {
  const result: LoadingResult = {
    placements: snapshot.result.placements,
    remaining: snapshot.result.remaining,
    loadedWeightKg: snapshot.result.totalPalletizedWeightKg,
    usedVolumeM3: snapshot.result.placements.reduce(
      (sum, placement) => sum + placement.length * placement.width * placement.height,
      0,
    ),
    validationIssues: [],
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

export function certificationMatchesTarget(
  target: PhysicsTarget | undefined,
  certification: InertiaCertification | undefined,
): certification is InertiaCertification {
  if (!target || !certification || certification.status !== 'passed') return false;
  if (target.mode !== certification.mode) return false;
  return certification.targetSignature === createPhysicsTargetSignature(target);
}

function palletSnapshotSpecMatchesResult(snapshot: CertifiedPalletSnapshot) {
  const { spec, result } = snapshot;
  if (!Number.isInteger(spec.maxStackLevels) || spec.maxStackLevels < 1) return false;
  if (result.maxUsedStackLevel > spec.maxStackLevels) return false;
  return result.pallets.every((pallet) =>
    Math.abs(pallet.length - spec.length) <= EPS
    && Math.abs(pallet.width - spec.width) <= EPS
    && Math.abs(pallet.height - spec.height) <= EPS
    && pallet.cargoWeightKg <= spec.maxLoadKg + EPS
    && pallet.stackLevel <= spec.maxStackLevels);
}

/**
 * Final pallet output is allowed only when all three objects describe the same physical plan:
 * live physics target, PASS certification, and the pallet snapshot used to render/export coordinates.
 * The displayed pallet specification must also agree with every pallet in the certified result.
 */
export function palletSnapshotMatchesCertification(
  snapshot: CertifiedPalletSnapshot | undefined,
  target: PhysicsTarget | undefined,
  certification: InertiaCertification | undefined,
): certification is InertiaCertification {
  if (!snapshot || !target || target.mode !== 'pallets') return false;
  if (!palletSnapshotSpecMatchesResult(snapshot)) return false;
  if (!certificationMatchesTarget(target, certification) || certification.mode !== 'pallets') return false;
  const snapshotTarget = physicsTargetFromPalletSnapshot(target.container, target.cargo, snapshot);
  return createPhysicsTargetSignature(snapshotTarget) === certification.targetSignature;
}
