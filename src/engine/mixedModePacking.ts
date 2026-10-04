import { defaultPalletSpec, preparePalletsForLoading, type OptimizedPalletPackingResult, type PalletSpec } from './palletOptimization';
import { palletFillRate, placePreparedPallets } from './palletContainerPlacement';
import { palletInputError } from './palletPacking';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

/** Retained for saved callers; the removed demotion optimizer no longer uses these values. */
export type MixedModeOptions = { minPalletFillRatio?: number; maxDemotionCandidates?: number };
export type MixedModeMeta = {
  enabled: true;
  directBoxCount: number;
  directFloorBoxCount: number;
  palletBoxCount: number;
  palletCount: number;
  demotedPalletCount: number;
  candidateCount: number;
  minPalletFillRatio: number;
  totalLoadedWeightKg: number;
  palletFillRates: Array<{ palletIndex: number; fillRate: number; eligibleForDirect: boolean }>;
};
export type MixedModePackingResult = OptimizedPalletPackingResult & { mixed: MixedModeMeta };

/** Prepare pallets, then send those rigid units and genuine loose remainders to A once. */
export function packMixedMode(
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec = defaultPalletSpec,
  strategy: LoadingStrategy = 'capacity',
  _options: MixedModeOptions = {},
): MixedModePackingResult {
  const preflight = preflightCargoInput(cargo);
  const prepared = preparePalletsForLoading(container, preflight.cargo, pallet, strategy);
  const byId = new Map(preflight.cargo.map(item => [item.id, item]));
  const invalidConfiguration = containerInputError(container) ?? palletInputError(pallet);
  const looseCargo = invalidConfiguration ? [] : prepared.remaining.flatMap(row => {
    const source = byId.get(row.cargoId);
    return source && row.quantity > 0 ? [{ ...source, quantity: row.quantity }] : [];
  });
  const unresolved = [...preflight.rejected, ...prepared.remaining.filter(row => invalidConfiguration || !byId.has(row.cargoId))];
  const result = placePreparedPallets(container, preflight.cargo, pallet, prepared, looseCargo, unresolved);
  const palletBoxCount = result.pallets.reduce((sum, load) => sum + load.cargoPlacements.length, 0);
  const rigidIds = new Set(result.ruleEngineInput?.palletUnits.map(unit => unit.cargoId));
  const direct = result.ruleEngineInput?.placements.filter(p => !rigidIds.has(p.cargoId)) ?? [];
  return {
    ...result,
    optimization: { ...prepared.optimization, selectedStackTarget: result.maxUsedStackLevel, floorPositions: result.pallets.filter(p => p.stackLevel === 1).length },
    mixed: {
      enabled: true,
      directBoxCount: direct.length,
      directFloorBoxCount: direct.filter(p => p.z <= .0015).length,
      palletBoxCount,
      palletCount: result.palletCount,
      demotedPalletCount: 0,
      candidateCount: 1,
      minPalletFillRatio: 0,
      totalLoadedWeightKg: result.ruleEngineInput?.placements.reduce((sum, p) => sum + p.weightKg, 0) ?? 0,
      palletFillRates: prepared.pallets.map(load => ({ palletIndex: load.palletIndex, fillRate: palletFillRate(load), eligibleForDirect: false })),
    },
  };
}
