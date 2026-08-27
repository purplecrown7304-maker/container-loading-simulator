import { palletSnapshotMatchesCertification } from './certifiedExport';
import { readCertificationState, subscribeCertification } from './certificationStore';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { readPalletSnapshot, subscribePalletSnapshot } from './palletSnapshotStore';
import { readPhysicsTarget } from './physicsTarget';

function invalidateIfDesynced() {
  const target = readPhysicsTarget();
  if (!target || target.mode !== 'pallets') return;
  const certification = readCertificationState();
  if (!certification || certification.status !== 'passed') return;
  if (!palletSnapshotMatchesCertification(readPalletSnapshot(), target, certification)) {
    clearLatestInertiaCertification();
  }
}

// Domain policy: any published PASS must reconstruct the exact same pallet
// snapshot as the current physics target. Subscriptions replace the previous
// return-null React Bridge while retaining fail-closed export behavior.
subscribeCertification(invalidateIfDesynced);
subscribePalletSnapshot(invalidateIfDesynced);
invalidateIfDesynced();
