import { useEffect } from 'react';
import { palletSnapshotMatchesCertification, type CertifiedPalletSnapshot } from './certifiedExport';
import {
  INERTIA_CERTIFICATION_EVENT,
  clearLatestInertiaCertification,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';

const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

type SnapshotWindow = Window & { __containerLoadingPalletSnapshot?: CertifiedPalletSnapshot };

function currentSnapshot() {
  return (window as SnapshotWindow).__containerLoadingPalletSnapshot;
}

function invalidateIfDesynced(certification?: InertiaCertification) {
  const target = readPhysicsTarget();
  if (!target || target.mode !== 'pallets') return;
  const cert = certification ?? readLatestInertiaCertification();
  if (!cert || cert.status !== 'passed') return;
  if (!palletSnapshotMatchesCertification(currentSnapshot(), target, cert)) {
    clearLatestInertiaCertification();
  }
}

/**
 * The pallet renderer/exporter keeps a detailed pallet snapshot alongside the
 * generic physics target. Any snapshot change invalidates the old PASS, and a
 * newly published PASS is accepted only when the snapshot reconstructs the
 * exact same target signature. This prevents a certified A-layout from being
 * exported as stale B-layout coordinates.
 */
export default function CertifiedExportConsistencyBridge() {
  useEffect(() => {
    const onSnapshotChanged = () => clearLatestInertiaCertification();
    const onCertification = (event: Event) => {
      const certification = (event as CustomEvent<InertiaCertification | undefined>).detail;
      if (certification?.status === 'passed') invalidateIfDesynced(certification);
    };

    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshotChanged);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    invalidateIfDesynced();
    return () => {
      window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshotChanged);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    };
  }, []);
  return null;
}
