import { afterEach, describe, expect, it } from 'vitest';
import { defaultPalletSpec, type OptimizedPalletPackingResult, type PalletLoad } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import { clearPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';
import { buildPalletPhysicsTarget, restorePalletPhysicsTarget } from './palletTargetRestore';
import { clearPhysicsTarget, readPhysicsTarget } from './physicsTarget';

const container: ContainerSpec = {
  length: 5,
  width: 2.4,
  height: 2.4,
  maxPayloadKg: 5000,
};

const cargo: CargoItem[] = [{
  id: 'BOX-A',
  name: '테스트 박스',
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
  quantity: 1,
  maxStackLayers: 4,
  maxTopLoadKg: 100,
  allowRotation: true,
}];

const placement: Placement = {
  cargoId: 'BOX-A',
  x: 0,
  y: 0,
  z: defaultPalletSpec.height,
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
};

const pallet: PalletLoad = {
  palletIndex: 1,
  x: 0,
  y: 0,
  z: 0,
  stackLevel: 1,
  stackColumn: 1,
  length: defaultPalletSpec.length,
  width: defaultPalletSpec.width,
  height: defaultPalletSpec.height,
  cargoPlacements: [placement],
  cargoWeightKg: 10,
  packagingWeightKg: 0,
  packagingExtraHeightM: 0,
  cornerGuardsUsed: false,
  wrappingUsed: false,
  totalWeightKg: 10 + defaultPalletSpec.tareWeightKg,
  centerOfGravity: { x: 0.25, y: 0.2, z: defaultPalletSpec.height + 0.15 },
};

const result: OptimizedPalletPackingResult = {
  pallets: [pallet],
  placements: [placement],
  remaining: [],
  palletCount: 1,
  loadedCargoWeightKg: 10,
  totalPackagingWeightKg: 0,
  avoidedPackagingWeightKg: 0,
  packagedPalletCount: 0,
  totalPalletizedWeightKg: pallet.totalWeightKg,
  consolidatedPallets: 0,
  lateralImbalanceKg: 0,
  stackedPallets: 0,
  maxUsedStackLevel: 1,
  optimization: {
    selectedStackTarget: 1,
    candidateCount: 1,
    floorPositions: 1,
    redistributedForLowUtilization: false,
    consolidationPasses: 0,
  },
};

afterEach(() => {
  clearPalletSnapshot({ preserveCertification: true });
  clearPhysicsTarget();
});

describe('pallet target restoration', () => {
  it('rebuilds the same pallet result and support geometry from the persisted snapshot', () => {
    publishPalletSnapshot({ spec: defaultPalletSpec, result }, { preserveCertification: true, emitLegacyEvent: false });
    const target = buildPalletPhysicsTarget(container, cargo);

    expect(target?.mode).toBe('pallets');
    expect(target?.result.placements).toEqual([placement]);
    expect(target?.result.loadedWeightKg).toBe(pallet.totalWeightKg);
    expect(target?.supports).toHaveLength(1);
    expect(target?.supports?.[0]).toMatchObject({
      id: 'PALLET-01',
      x: 0,
      y: 0,
      z: 0,
      length: defaultPalletSpec.length,
      width: defaultPalletSpec.width,
      height: defaultPalletSpec.height,
      dynamic: true,
    });
  });

  it('publishes the restored target so result and work-order actions can reuse it', () => {
    publishPalletSnapshot({ spec: defaultPalletSpec, result }, { preserveCertification: true, emitLegacyEvent: false });
    expect(readPhysicsTarget()).toBeUndefined();

    const restored = restorePalletPhysicsTarget(container, cargo);

    expect(restored?.mode).toBe('pallets');
    expect(readPhysicsTarget()).toEqual(restored);
  });
});
