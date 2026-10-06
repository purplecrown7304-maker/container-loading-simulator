import { afterEach, expect, it } from 'vitest';
import './certifiedExportConsistency';
import { physicsTargetFromPalletSnapshot, type CertifiedPalletSnapshot } from './certifiedExport';
import { defaultPalletSpec } from './engine/palletOptimization';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget } from './physicsTarget';
import { clearPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';
import { isPhysicsTargetVerified } from './inertiaWorkOrderPolicy';

const placement = { cargoId: 'A', x: .3, y: .3, z: defaultPalletSpec.height, length: .5, width: .5, height: .3, weightKg: 1 };
const snapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: {
  pallets: [{ palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1, length: defaultPalletSpec.length, width: defaultPalletSpec.width, height: defaultPalletSpec.height, cargoPlacements: [placement], cargoWeightKg: 1, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 26, centerOfGravity: { x: .55, y: .55, z: .3 } }],
  placements: [placement], remaining: [], palletCount: 1, loadedCargoWeightKg: 1, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 26, consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
  optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
} };
afterEach(() => { clearLatestInertiaCertification(); clearPhysicsTarget(); clearPalletSnapshot({ preserveCertification: true }); });

it.each(['passed', 'failed'] as const)('retains identity-matching %s certification as review evidence despite static failure, then invalidates stale identity', status => {
  const target = physicsTargetFromPalletSnapshot({ length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 }, [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 1, quantity: 1 }], snapshot);
  const cert: InertiaCertification = { status, mode: 'pallets', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: .005, maxTiltDeg: .5, payloadWithinLimit: true, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) };
  publishPhysicsTarget(target); publishPalletSnapshot(snapshot, { preserveCertification: true });
  const state = window as Window & { __containerLoadingLatestCertification?: InertiaCertification };
  state.__containerLoadingLatestCertification = cert;
  window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: cert }));
  expect(isPhysicsTargetVerified(target, cert)).toBe(false);
  expect(readLatestInertiaCertification()).toBe(cert);
  const stale = { ...cert, targetSignature: 'old' };
  state.__containerLoadingLatestCertification = stale;
  window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: stale }));
  expect(readLatestInertiaCertification()).toBeUndefined();
});
