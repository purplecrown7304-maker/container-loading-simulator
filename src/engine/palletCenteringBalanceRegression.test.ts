import { describe, expect, it } from 'vitest';
import { centerPalletCargo } from './palletCentering';
import type { OptimizedPalletPackingResult, PalletLoad } from './palletOptimization';

function load(): PalletLoad {
  return {
    palletIndex: 1,
    x: 0,
    y: 0.625,
    z: 0,
    stackLevel: 1,
    stackColumn: 1,
    length: 1.1,
    width: 1.1,
    height: 0.15,
    cargoPlacements: [{
      cargoId: 'A',
      x: 0,
      y: 0.625,
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
    centerOfGravity: { x: 0.35, y: 0.895, z: 0.27 },
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
  it('recalculates stale lateral imbalance after moving cargo to the pallet center', () => {
    const centered = centerPalletCargo(result(load()));
    expect(centered.placements[0]?.y).toBeCloseTo(0.975, 6);
    expect(centered.pallets[0]?.centerOfGravity.y).toBeCloseTo(1.175, 6);
    expect(centered.lateralImbalanceKg).toBe(0);
  });
});
