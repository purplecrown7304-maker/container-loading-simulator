import type { CargoItem, LoadingResult, PalletRuleEngineProvenance, Placement } from '../engine/types';
import { exactInputSignature, normalizedCargoIdentity } from './inputIdentity';

type Canonical = Omit<NonNullable<LoadingResult['ruleEngineInput']>, 'provenance'>;

/** Called only by pallet generation after the rigid and displayed layouts are final. */
export function createPalletRuleEngineProvenance(sourceCargo: CargoItem[], displayPlacements: Placement[], canonical: Canonical, pallets: unknown[], preparationSpec?: unknown): PalletRuleEngineProvenance {
  return {
    version: 1,
    sourceSignature: exactInputSignature(normalizedCargoIdentity(sourceCargo)),
    canonicalSignature: exactInputSignature({ cargo: canonical.cargo, placements: canonical.placements, palletUnits: canonical.palletUnits }),
    displaySignature: exactInputSignature(displayPlacements),
    palletSnapshotSignature: exactInputSignature(pallets),
    preparationSpecSignature: exactInputSignature(preparationSpec ?? null),
  };
}

/** Revalidation cannot create new provenance for an edited preparation snapshot. */
export function matchesPalletRuleEngineProvenance(sourceCargo: CargoItem[], displayPlacements: Placement[], canonical: NonNullable<LoadingResult['ruleEngineInput']>): boolean {
  const proof = canonical.provenance;
  return proof?.version === 1
    && proof.sourceSignature === exactInputSignature(normalizedCargoIdentity(sourceCargo))
    && proof.canonicalSignature === exactInputSignature({ cargo: canonical.cargo, placements: canonical.placements, palletUnits: canonical.palletUnits })
    && proof.displaySignature === exactInputSignature(displayPlacements);
}

export function matchesPalletSnapshotProvenance(canonical: NonNullable<LoadingResult['ruleEngineInput']>, pallets: unknown[]): boolean {
  return canonical.provenance?.version === 1 && canonical.provenance.palletSnapshotSignature === exactInputSignature(pallets);
}

/** The report must use the same selected pallet/material specification as preparation. */
export function matchesPalletPreparationSpec(canonical: NonNullable<LoadingResult['ruleEngineInput']>, spec: unknown): boolean {
  return canonical.provenance?.version === 1 && canonical.provenance.preparationSpecSignature === exactInputSignature(spec);
}
