import { describe, expect, it } from 'vitest';
import { applyPalletStrategyToResult } from './palletStrategy';
import type { CargoItem, ContainerSpec } from './types';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './palletOptimization';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 20000 };
const spec: PalletSpec = {
  length: 1.2, width: 1.0, height: 0.15, tareWeightKg: 20, maxLoadKg: 1500,
  maxStackLevels: 1, maxSupportedTopWeightKg: 0,
  useCornerGuards: false, cornerGuardWeightKg: 0, cornerGuardExtraHeightM: 0,
  useWrapping: false, wrappingWeightKg: 0, wrappingExtraHeightM: 0,
  minimizePackaging: true,
};

function load(index: number, x: number, y: number, cargoId: string, weight: number): PalletLoad {
  return {
    palletIndex: index, stackLevel: 1, stackColumn: index,
    x, y, z: 0, length: spec.length, width: spec.width, height: spec.height,
    cargoPlacements: [{ cargoId, x, y, z: spec.height, length: 1, width: .8, height: .5, weightKg: weight }],
    cargoWeightKg: weight, packagingWeightKg: 0, packagingExtraHeightM: 0, totalWeightKg: weight + spec.tareWeightKg,
    cornerGuardsUsed: false, wrappingUsed: false,
    centerOfGravity: { x: x + .5, y: y + .4, z: .4 },
  };
}

function result(pallets: PalletLoad[]): OptimizedPalletPackingResult {
  return {
    pallets,
    placements: pallets.flatMap(item => item.cargoPlacements),
    remaining: [], palletCount: pallets.length,
    loadedCargoWeightKg: pallets.reduce((s, p) => s + p.cargoWeightKg, 0),
    totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0,
    totalPalletizedWeightKg: pallets.reduce((s, p) => s + p.totalWeightKg, 0),
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
    optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: pallets.length, redistributedForLowUtilization: false, consolidationPasses: 0 },
  };
}

describe('pallet strategy post processor', () => {
  it('keeps late-unload pallet deeper when unloading mode is selected', () => {
    localStorage.setItem('container-loading-user-strategy-v2', 'unloading');
    const cargo: CargoItem[] = [
      { id: 'FIRST', name: 'first', length: 1, width: .8, height: .5, weightKg: 100, quantity: 1, unloadPriority: 1 },
      { id: 'LAST', name: 'last', length: 1, width: .8, height: .5, weightKg: 100, quantity: 1, unloadPriority: 9 },
    ];
    const output = applyPalletStrategyToResult(result([
      load(1, 0, .2, 'FIRST', 100),
      load(2, 3.6, .2, 'LAST', 100),
    ]), container, cargo, spec);
    const first = output.pallets.find(p => p.cargoPlacements[0]?.cargoId === 'FIRST')!;
    const last = output.pallets.find(p => p.cargoPlacements[0]?.cargoId === 'LAST')!;
    expect(last.x).toBeLessThan(first.x);
  });

  it('moves heavier columns to slots nearer the geometric center in balance mode', () => {
    localStorage.setItem('container-loading-user-strategy-v2', 'balance');
    const cargo: CargoItem[] = [
      { id: 'LIGHT', name: 'light', length: 1, width: .8, height: .5, weightKg: 50, quantity: 1 },
      { id: 'HEAVY', name: 'heavy', length: 1, width: .8, height: .5, weightKg: 800, quantity: 1 },
    ];
    const output = applyPalletStrategyToResult(result([
      load(1, 0, .2, 'LIGHT', 50),
      load(2, 2.4, .2, 'HEAVY', 800),
    ]), container, cargo, spec);
    const light = output.pallets.find(p => p.cargoPlacements[0]?.cargoId === 'LIGHT')!;
    const heavy = output.pallets.find(p => p.cargoPlacements[0]?.cargoId === 'HEAVY')!;
    const distance = (p: PalletLoad) => Math.abs(p.x + p.length / 2 - container.length / 2);
    expect(distance(heavy)).toBeLessThanOrEqual(distance(light));
  });
});
