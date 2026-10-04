import { PALLET_CATALOG, palletSpecForType, type PalletType } from './palletCatalog';
import { packOnPallets, type PalletSpec } from './palletOptimization';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

export type PalletTypeEvaluation = {
  typeId: string;
  requestedUnits: number;
  loadedUnits: number;
  palletCount: number;
  maxTiers: number;
  palletTareTotalKg: number;
  loadedCargoKg: number;
  fits: boolean;
};

export type PalletRecommendation = {
  evaluations: PalletTypeEvaluation[];
  recommendedId: string | null;
};

const EPS = 1e-9;

/** Run the real pallet engine for one pallet type. */
export function evaluatePalletType(
  container: ContainerSpec,
  cargo: CargoItem[],
  type: PalletType,
  strategy: LoadingStrategy,
  base?: PalletSpec,
): PalletTypeEvaluation {
  const active = cargo.filter(item => item.quantity > 0);
  const requestedUnits = active.reduce((sum, item) => sum + item.quantity, 0);
  if (!active.length) {
    return { typeId: type.id, requestedUnits, loadedUnits: 0, palletCount: 0, maxTiers: 0, palletTareTotalKg: 0, loadedCargoKg: 0, fits: false };
  }
  const result = packOnPallets(container, active, palletSpecForType(type, base), strategy);
  const fits = result.palletCount > 0 && !result.validationIssues?.length;
  const maxTiers = result.pallets.reduce((max, load) => {
    const levels = new Set(load.cargoPlacements.map(p => Math.round(p.z * 1000)));
    return Math.max(max, levels.size);
  }, 0);
  return {
    typeId: type.id,
    requestedUnits,
    loadedUnits: result.placements.length,
    palletCount: result.palletCount,
    maxTiers,
    palletTareTotalKg: result.palletCount * type.tareWeightKg,
    loadedCargoKg: result.loadedCargoWeightKg,
    fits,
  };
}

/**
 * Lexicographic ranking, same spirit as the loading objective hierarchy:
 * 1) more loaded units, 2) fewer pallets, 3) lighter total pallet tare,
 * 4) catalog order (deterministic tie-break).
 */
export function comparePalletEvaluations(a: PalletTypeEvaluation, b: PalletTypeEvaluation) {
  if (a.fits !== b.fits) return a.fits ? -1 : 1;
  if (a.loadedUnits !== b.loadedUnits) return b.loadedUnits - a.loadedUnits;
  if (a.palletCount !== b.palletCount) return a.palletCount - b.palletCount;
  if (Math.abs(a.palletTareTotalKg - b.palletTareTotalKg) > EPS) return a.palletTareTotalKg - b.palletTareTotalKg;
  return PALLET_CATALOG.findIndex(t => t.id === a.typeId) - PALLET_CATALOG.findIndex(t => t.id === b.typeId);
}

export function pickRecommendation(evaluations: PalletTypeEvaluation[]) {
  const best = [...evaluations].filter(e => e.fits && e.loadedUnits > 0).sort(comparePalletEvaluations)[0];
  return best?.typeId ?? null;
}

export function recommendPallets(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
  types: readonly PalletType[] = PALLET_CATALOG,
  base?: PalletSpec,
): PalletRecommendation {
  const evaluations = types.map(type => evaluatePalletType(container, cargo, type, strategy, base));
  return { evaluations, recommendedId: pickRecommendation(evaluations) };
}
