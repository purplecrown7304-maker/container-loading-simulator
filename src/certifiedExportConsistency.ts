import { palletSnapshotMatchesWorkOrderCertification } from './certifiedExport';
import { readCertificationState, subscribeCertification } from './certificationStore';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { readPalletSnapshot, subscribePalletSnapshot } from './palletSnapshotStore';
import { readPhysicsTarget } from './physicsTarget';

function invalidateIfDesynced() {
  const target = readPhysicsTarget();
  if (!target || target.mode !== 'pallets') return;
  const certification = readCertificationState();
  if (!certification) return;
  if (!palletSnapshotMatchesWorkOrderCertification(readPalletSnapshot(), target, certification)) {
    clearLatestInertiaCertification();
  }
}

// Domain policy: any published result must reconstruct the exact same pallet
// snapshot as the current physics target. Subscriptions replace the previous
// return-null React Bridge. Current failures remain available as review evidence;
// approval is enforced separately by each strict result/export consumer.
subscribeCertification(invalidateIfDesynced);
subscribePalletSnapshot(invalidateIfDesynced);
invalidateIfDesynced();
