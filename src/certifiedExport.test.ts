import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, type OptimizedPalletPackingResult } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec } from './engine/types';
import { createPhysicsTargetSignature, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import {
  palletSnapshotMatchesCertification,
  physicsTargetFromPalletSnapshot,
  type CertifiedPalletSnapshot,
} from './certifiedExport';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const cargo: CargoItem[] = [{
  id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3,
  weightKg: 10, quantity: 1, maxStackLayers: 4, maxTopLoadKg: 100,
}];

function result(): OptimizedPalletPackingResult {
  const placement = { cargoId: 'A', x: 0.3, y: 0.35, z: 0.15, length: 0.5, width: 0.4, height: 0.3, weightKg: 10 };
  return {
    pallets: [{
      palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1,
      length: 1.1, width: 1.1, height: 0.15,
      cargoPlacements: [placement], cargoWeightKg: 10, packagingWeightKg: 0,
      packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
      totalWeightKg: 35, centerOfGravity: { x: 0.55, y: 0.55, z: 0.2 },
    }],
    placements: [placement], remaining: [], palletCount: 1, loadedCargoWeightKg: 10,
    totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0,
    totalPalletizedWeightKg: 35, consolidatedPallets: 0, lateralImbalanceKg: 35,
    stackedPallets: 0, maxUsedStackLevel: 1,
    optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
  };
}

const securing: SecuringUsage = {
  level: 1, levelLabel: 'test', palletCount: 1, palletWeightKg: 25,
  bandingStraps: 2, bandingLengthM: 4, cornerGuards: 4, cornerGuardLengthM: 1.2,
  wrappingLengthM: 10, antiSlipMats: 1, dunnageBlocks: 0, loadBars: 0,
  estimatedAddedWeightKg: 1, estimatedNonCargoWeightKg: 26,
};

function certification(signature: string): InertiaCertification {
  return {
    status: 'passed', mode: 'pallets', targetSignature: signature, testedAt: '2026-08-27T00:00:00.000Z',
    securing, testedScenarios: 3, passedScenarios: 3, failedScenarios: [],
    maxHorizontalShiftM: 0.001, maxTiltDeg: 0.1, maxCargoRelativeSlipM: 0.001,
    maxSupportShiftM: 0.001, results: {}, payloadWithinLimit: true,
  };
}

describe('certified pallet export identity', () => {
  it('accepts only the pallet snapshot that reconstructs the certified target', () => {
    const snapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: result() };
    const target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
    const cert = certification(createPhysicsTargetSignature(target));
    expect(palletSnapshotMatchesCertification(snapshot, target, cert)).toBe(true);
  });

  it('rejects a stale snapshot whose exported coordinates differ from the certified target', () => {
    const certifiedSnapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: result() };
    const target = physicsTargetFromPalletSnapshot(container, cargo, certifiedSnapshot);
    const cert = certification(createPhysicsTargetSignature(target));

    const staleResult = result();
    staleResult.pallets[0] = {
      ...staleResult.pallets[0],
      x: 1.1,
      cargoPlacements: staleResult.pallets[0].cargoPlacements.map(item => ({ ...item, x: item.x + 1.1 })),
    };
    staleResult.placements = staleResult.pallets.flatMap(pallet => pallet.cargoPlacements);
    const staleSnapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: staleResult };

    expect(palletSnapshotMatchesCertification(staleSnapshot, target, cert)).toBe(false);
  });

  it('rejects a snapshot whose displayed pallet dimensions differ from the certified result', () => {
    const certifiedSnapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: result() };
    const target = physicsTargetFromPalletSnapshot(container, cargo, certifiedSnapshot);
    const cert = certification(createPhysicsTargetSignature(target));
    const staleSpecSnapshot: CertifiedPalletSnapshot = {
      spec: { ...defaultPalletSpec, length: 1.2 },
      result: result(),
    };
    expect(palletSnapshotMatchesCertification(staleSpecSnapshot, target, cert)).toBe(false);
  });

  it('rejects a snapshot whose configured stack limit is below the exported stack level', () => {
    const stackedResult = result();
    stackedResult.pallets[0] = { ...stackedResult.pallets[0], stackLevel: 4 };
    stackedResult.maxUsedStackLevel = 4;
    const certifiedSnapshot: CertifiedPalletSnapshot = { spec: { ...defaultPalletSpec, maxStackLevels: 4 }, result: stackedResult };
    const target = physicsTargetFromPalletSnapshot(container, cargo, certifiedSnapshot);
    const cert = certification(createPhysicsTargetSignature(target));
    const staleSpecSnapshot: CertifiedPalletSnapshot = { spec: { ...defaultPalletSpec, maxStackLevels: 3 }, result: stackedResult };
    expect(palletSnapshotMatchesCertification(staleSpecSnapshot, target, cert)).toBe(false);
  });
});
