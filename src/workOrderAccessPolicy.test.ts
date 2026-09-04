import { describe, expect, it } from 'vitest';
import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import { boxWorkOrderHardBlockers, palletWorkOrderHardBlockers } from './workOrderAccessPolicy';

const container: ContainerSpec = { length: 4, width: 2, height: 2.5, maxPayloadKg: 10000 };
const placement: Placement = { cargoId: 'A', x: 1, y: 0.5, z: 0, length: 1, width: 1, height: 1, weightKg: 100 };

function boxResult(overrides: Partial<LoadingResult> = {}): LoadingResult {
  return {
    placements: [placement],
    remaining: [],
    loadedWeightKg: 100,
    usedVolumeM3: 1,
    validationIssues: [],
    ...overrides,
  };
}

const palletSpec: PalletSpec = {
  length: 1.1,
  width: 1.1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
  maxStackLevels: 2,
  maxSupportedTopWeightKg: 1000,
  useCornerGuards: false,
  cornerGuardWeightKg: 2,
  cornerGuardExtraHeightM: 0.03,
  useWrapping: false,
  wrappingWeightKg: 1.5,
  wrappingExtraHeightM: 0.01,
  minimizePackaging: true,
};

function palletResult(overrides: Partial<OptimizedPalletPackingResult> = {}): OptimizedPalletPackingResult {
  return {
    pallets: [{
      palletIndex: 1,
      x: 1,
      y: 0.4,
      z: 0,
      stackLevel: 1,
      stackColumn: 1,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      cargoPlacements: [placement],
      cargoWeightKg: 100,
      packagingWeightKg: 0,
      packagingExtraHeightM: 0,
      cornerGuardsUsed: false,
      wrappingUsed: false,
      totalWeightKg: 125,
      centerOfGravity: { x: 1.55, y: 0.95, z: 0.5 },
    }],
    placements: [placement],
    remaining: [],
    palletCount: 1,
    loadedCargoWeightKg: 100,
    totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0,
    totalPalletizedWeightKg: 125,
    consolidatedPallets: 0,
    lateralImbalanceKg: 0,
    stackedPallets: 0,
    maxUsedStackLevel: 1,
    optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
    ...overrides,
  };
}

describe('work order access hard blockers', () => {
  it('allows a physically valid box plan without requiring inertia certification', () => {
    expect(boxWorkOrderHardBlockers(container, boxResult())).toEqual([]);
  });

  it('blocks box output only for physical impossibility such as collision/bounds/payload', () => {
    expect(boxWorkOrderHardBlockers(container, boxResult({ loadedWeightKg: 12000 }))).not.toEqual([]);
    expect(boxWorkOrderHardBlockers(container, boxResult({ validationIssues: [{ type: 'OUT_OF_BOUNDS', message: '경계 침범', placementIndexes: [0] }] }))).toContain('경계 침범');
  });

  it('allows a physically valid pallet plan without requiring inertia certification', () => {
    expect(palletWorkOrderHardBlockers(container, { spec: palletSpec, result: palletResult() })).toEqual([]);
  });

  it('blocks pallet output for payload or pallet structural limits', () => {
    expect(palletWorkOrderHardBlockers(container, { spec: palletSpec, result: palletResult({ totalPalletizedWeightKg: 12000 }) })).not.toEqual([]);
    expect(palletWorkOrderHardBlockers(container, { spec: palletSpec, result: palletResult({ maxUsedStackLevel: 3 }) })).not.toEqual([]);
  });
});
