import { describe, expect, it } from 'vitest';
import { packOnPallets, type PalletSpec } from './engine/palletOptimization';
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

describe('A-only work order access', () => {
  it('requires reloading an old untagged plan through A', () => {
    expect(boxWorkOrderHardBlockers(container, boxResult())).toContain('A 적재 방식으로 다시 계산해야 합니다.');
  });

  it('preserves A hard errors and ignores optional warning severity', () => {
    expect(boxWorkOrderHardBlockers(container, boxResult({ ruleEngine: 'load-sim', operationalFindings: [{ code: 'GAP', severity: 'warning', message: 'Gap', placementIndexes: [] }] }))).toEqual([]);
    expect(boxWorkOrderHardBlockers(container, boxResult({ ruleEngine: 'load-sim', operationalFindings: [{ code: 'OVERLAP', severity: 'error', message: 'A overlap', placementIndexes: [0] }] }))).toContain('A overlap');
  });

  it('uses canonical A pallet rules rather than a second legacy stack-level veto', () => {
    const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 2 }];
    const result = packOnPallets(container, cargo, palletSpec);
    expect(result.ruleEngineInput?.provenance).toBeDefined();
    result.maxUsedStackLevel = 99; // Retired summary metadata cannot override the actual A rigid geometry.
    expect(palletWorkOrderHardBlockers(container, { spec: palletSpec, result })).toEqual([]);
    result.ruleEngineInput!.placements[0].x = 10;
    expect(palletWorkOrderHardBlockers(container, { spec: palletSpec, result }).length).toBeGreaterThan(0);
  });
});
