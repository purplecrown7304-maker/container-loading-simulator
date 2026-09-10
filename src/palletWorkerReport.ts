export * from './palletWorkerReportV2';

import type { CargoItem, ContainerSpec } from './engine/types';
import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { requestFinalWorkOrder } from './finalWorkOrderEvents';
import { readPhysicsTarget } from './physicsTarget';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';

/**
 * A work-order request must always lead to a document for an existing pallet loading
 * result. When the current pallet target already has a matching inertia snapshot we
 * open it immediately. Otherwise start the final work-order certification flow; the
 * optimizer will record the available PASS/caution/danger result and open the report
 * without using that safety grade as an output gate.
 */
export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  const matches = Boolean(
    target
    && target.mode === 'pallets'
    && certification?.mode === 'pallets'
    && certification.targetSignature === createPhysicsTargetSignature(target),
  );

  if (matches) return openPalletLoadingReportV2(container, cargo);
  requestFinalWorkOrder(container, cargo);
  return true;
}
