import { describe, expect, it } from 'vitest';
import { centerPalletCargo } from './palletCentering';
import type { OptimizedPalletPackingResult, PalletLoad } from './palletOptimization';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 4,
  width: 2.35,
  height: 2.6,
  maxPayloadKg: 10000,
};

function load(): PalletLoad {
  return {
    palletIndex: 1,
    x: 0,
    y: 0,
    z: 0,
    stackLevel: 1,
    stackColumn: 1,
    length: 1.1,
    width: 1.1,
    height: 0.15,
    cargoPlacements: [{
      cargoId: 'A',
      x: 0,
      y: 0,
      z: 0.15,
      length: 0.5,
      width: 0.4,
      height: 0.3,
      weightKg: 100,
    }],
    cargoWeightKg: 100,
    packagingWeightKg: 0,
    packagingExtraHeightM: 0,
    cornerGuardsUsed: false,
    wrappingUsed: false,
    totalWeightKg: 125,
    centerOfGravity: { x: 0.35, y: 0.27, z: 0.27 },
  };
}

function result(pallet: PalletLoad): OptimizedPalletPackingResult {
  return {
    pallets: [pallet],
    placements: pallet.cargoPlacements,
    remaining: [],
    palletCount: 1,
    loadedCargoWeightKg: 100,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: 125,
    consolidatedPallets: 0,
    lateralImbalanceKg: 125,
    stackedPallets: 0,
    maxUsedStackLevel: 1,
    optimization: {
      selectedStackTarget: 1,
      candidateCount: 1,
      floorPositions: 1,
      redistributedForLowUtilization: true,
      consolidationPasses: 0,
    },
  };
}

describe('pallet centering balance regression', () => {
  it('uses the container center rather than the occupied pallet footprint center', () => {
    const centered = centerPalletCargo(result(load()), container);
    const pallet = centered.pallets[0];

    expect(pallet.centerOfGravity.x).toBeCloseTo(container.length / 2, 6);
    expect(pallet.centerOfGravity.y).toBeCloseTo(container.width / 2, 6);
    expect(pallet.x).toBeGreaterThan(0);
    expect(pallet.y).toBeGreaterThan(0);
    expect(centered.lateralImbalanceKg).toBe(0);
  });
});
