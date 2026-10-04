import { describe, expect, it } from 'vitest';
import { packMixedMode } from './mixedModePacking';
import { defaultPalletSpec, preparePalletsForLoading } from './palletOptimization';
import { loadContainerWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem } from './types';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 5000 };
const pallet = { ...defaultPalletSpec, maxStackLevels: 1 };
const cargo: CargoItem[] = [
  { id: 'PALLETIZABLE', name: 'small', length: .5, width: .5, height: .3, weightKg: 10, quantity: 5, maxStackLayers: 1 },
  { id: 'LOOSE', name: 'long', length: 1.4, width: .3, height: .3, weightKg: 10, quantity: 2, maxStackLayers: 1, allowRotation: false },
];

describe('A-only mixed pallet + loose container loading', () => {
  it('combines finished pallets and genuine loose remainders in one A call', () => {
    const prepared = preparePalletsForLoading(container, cargo, pallet);
    const result = packMixedMode(container, cargo, pallet);
    const input = result.ruleEngineInput!;
    expect(input.placements).toEqual(loadContainerWithLoadSim(container, input.cargo).placements);
    expect(validateExistingWithLoadSim(container, input.cargo, input.placements).validation.ok).toBe(true);
    expect(input.cargo.filter(item => item.unitKind === 'pallet')).toHaveLength(prepared.palletCount);
    expect(input.cargo.filter(item => item.unitKind !== 'pallet')).toMatchObject([{ id: 'LOOSE', quantity: 2 }]);
    expect(result.mixed.directBoxCount).toBe(2);
    expect(result.mixed.palletBoxCount).toBe(5);
    expect(result.mixed.totalLoadedWeightKg).toBe(result.totalPalletizedWeightKg + 20);
    expect(result.placements.reduce((sum, p) => sum + p.weightKg, 0)).toBe(70);
    for (const item of cargo) expect(result.placements.filter(p => p.cargoId === item.id).length + result.remaining.filter(p => p.cargoId === item.id).reduce((sum, p) => sum + p.quantity, 0)).toBe(item.quantity);
  });

  it('never demotes a sparse pallet through the removed 70% heuristic', () => {
    const normal = packMixedMode(container, cargo, pallet);
    const oldOptions = packMixedMode(container, cargo, pallet, 'capacity', { minPalletFillRatio: 1, maxDemotionCandidates: 20 });
    expect(oldOptions).toEqual(normal);
    expect(normal.mixed.demotedPalletCount).toBe(0);
    expect(normal.mixed.candidateCount).toBe(1);
    expect(normal.mixed.palletFillRates.every(row => !row.eligibleForDirect)).toBe(true);
  });

  it('keeps whole rejected pallets waiting and preserves each requested quantity', () => {
    const result = packMixedMode({ ...container, maxPayloadKg: 30 }, cargo, pallet);
    expect(result.mixed.totalLoadedWeightKg).toBeLessThanOrEqual(30);
    for (const item of cargo) expect(result.placements.filter(p => p.cargoId === item.id).length + result.remaining.filter(p => p.cargoId === item.id).reduce((sum, p) => sum + p.quantity, 0)).toBe(item.quantity);
    expect(packMixedMode({ ...container, maxPayloadKg: 30 }, cargo, pallet)).toEqual(result);
  });
  it('does not resurrect rejected duplicate-SKU input as loose cargo', () => {
    const conflict = [{ ...cargo[0], id: 'BAD', quantity: 2 }, { ...cargo[0], id: 'BAD', length: .8, quantity: 3 }];
    const result = packMixedMode(container, conflict, pallet);
    expect(result.placements).toEqual([]);
    expect(result.ruleEngineInput?.cargo).toEqual([]);
    expect(result.remaining).toMatchObject([{ cargoId: 'BAD', quantity: 5 }]);
  });

  it('does not treat invalid pallet configuration as a loose-cargo fallback', () => {
    const result = packMixedMode(container, cargo, { ...pallet, width: 0 });
    expect(result.placements).toEqual([]);
    expect(result.remaining.reduce((sum, p) => sum + p.quantity, 0)).toBe(7);
  });

});
