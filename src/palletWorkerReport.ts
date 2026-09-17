export * from './palletWorkerReportV2';

import type { CargoItem, ContainerSpec } from './engine/types';
import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { requestFinalWorkOrder } from './finalWorkOrderEvents';
import { restorePalletPhysicsTarget } from './palletTargetRestore';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';

/**
 * A work-order request must always lead to a document for an existing pallet loading
 * result. Guided step 6 unmounts the 3D pallet viewer, so restore the exact physics
 * target from palletSnapshotStore before checking certification or starting a new
 * work-order verification. This never recalculates the pallet plan.
 */
export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const target = restorePalletPhysicsTarget(container, cargo);
  const certification = readLatestInertiaCertification();
  const matches = Boolean(
    target
    && target.mode === 'pallets'
    && certification?.mode === 'pallets'
    && certification.targetSignature === createPhysicsTargetSignature(target),
  );

  if (matches) return openPalletLoadingReportV2(container, cargo);
  if (!target) return false;
  requestFinalWorkOrder(container, cargo);
  return true;
}
