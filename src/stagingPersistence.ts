import type { PalletSnapshot } from './palletSnapshotStore';
import type { PalletLoad } from './engine/palletOptimization';
import { stagingInputSignature, type StagingIdentityHints, type StagingInput, type StagingMode } from './stagingInventory';

/** Only accepted plan/provenance is saved; yard quantities and display slots are derived. */
export type SavedStagingWorkspace = {
  version: 1;
  scopeKey: string;
  inputSignature: string;
  mode: StagingMode;
  identity: StagingIdentityHints;
  selectedUnitId: string | null;
  palletSnapshot?: PalletSnapshot;
  palletTypeId?: string;
  yardPallets?: PalletLoad[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function finite(value: unknown, minimum = 0): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= minimum; }
function finiteTree(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return !value || typeof value !== 'object' || Object.values(value).every(finiteTree);
}
function placement(value: unknown): boolean {
  return record(value) && text(value.cargoId) && (value.unitId === undefined || text(value.unitId))
    && ['x', 'y', 'z'].every(key => finite(value[key]))
    && ['length', 'width', 'height', 'weightKg'].every(key => finite(value[key], Number.MIN_VALUE));
}
function validBandingPlan(value: unknown): boolean {
  if (!record(value) || !Number.isSafeInteger(value.securingLevel) || !Number.isSafeInteger(value.straps)) return false;
  const level = value.securingLevel as number;
  // Preserve the real buildPalletSecuringPlan output, including its no-restraint
  // level. Neither arbitrary loop counts nor a different level/count pair is a plan.
  return level >= 0 && level <= 3 && value.straps === [0, 2, 3, 4][level]
    && (value.wrapping === undefined || typeof value.wrapping === 'boolean')
    && (value.cornerGuards === undefined || typeof value.cornerGuards === 'boolean');
}

/** Shape guard only. Current vehicle/input/support rules still run before any restore. */
export function validSavedStagingPallet(value: unknown): value is PalletLoad {
  const center = record(value) && value.centerOfGravity;
  return record(value) && finiteTree(value)
    && ['palletIndex', 'stackColumn'].every(key => Number.isSafeInteger(value[key]) && finite(value[key]))
    && Number.isSafeInteger(value.stackLevel) && finite(value.stackLevel, 1)
    && ['x', 'y', 'z', 'cargoWeightKg', 'packagingWeightKg', 'packagingExtraHeightM'].every(key => finite(value[key]))
    && ['length', 'width', 'height', 'totalWeightKg'].every(key => finite(value[key], Number.MIN_VALUE))
    && typeof value.cornerGuardsUsed === 'boolean' && typeof value.wrappingUsed === 'boolean'
    && (value.bandingPlan === undefined || validBandingPlan(value.bandingPlan))
    && Array.isArray(value.cargoPlacements) && value.cargoPlacements.length > 0 && value.cargoPlacements.every(placement)
    && record(center) && ['x', 'y', 'z'].every(key => finite(center[key]));
}

function palletSnapshot(value: unknown): boolean {
  if (!record(value) || !record(value.spec) || !record(value.result) || !finiteTree(value)) return false;
  const { spec, result } = value;
  if (result.securingBudget !== undefined && (!record(result.securingBudget)
    || ![1, 2, 3].includes(result.securingBudget.level as number)
    || !['reservedWeightKg', 'requiredWeightKg', 'totalTransportWeightKg'].every(key => finite((result.securingBudget as Record<string, unknown>)[key])))) return false;
  if (result.mixed !== undefined) {
    if (!record(result.mixed)) return false;
    const mixed = result.mixed;
    if (mixed.enabled !== true || !['directBoxCount', 'directFloorBoxCount', 'palletBoxCount', 'palletCount',
      'demotedPalletCount', 'candidateCount', 'minPalletFillRatio', 'totalLoadedWeightKg'].every(key => finite(mixed[key]))
      || !Array.isArray(mixed.palletFillRates) || !mixed.palletFillRates.every(row => record(row)
        && Number.isSafeInteger(row.palletIndex) && finite(row.palletIndex) && finite(row.fillRate)
        && typeof row.eligibleForDirect === 'boolean')) return false;
  }
  if (!record(result.optimization)) return false;
  const optimization = result.optimization;
  return ['length', 'width', 'height', 'maxLoadKg'].every(key => finite(spec[key], Number.MIN_VALUE))
    && ['tareWeightKg', 'maxSupportedTopWeightKg', 'cornerGuardWeightKg', 'cornerGuardExtraHeightM', 'wrappingWeightKg', 'wrappingExtraHeightM'].every(key => finite(spec[key]))
    && Number.isSafeInteger(spec.maxStackLevels) && finite(spec.maxStackLevels, 1)
    && ['useCornerGuards', 'useWrapping', 'minimizePackaging'].every(key => typeof spec[key] === 'boolean')
    && Array.isArray(result.pallets) && result.pallets.every(validSavedStagingPallet)
    && Array.isArray(result.placements) && result.placements.every(placement)
    && Array.isArray(result.remaining) && result.remaining.every(row => record(row) && text(row.cargoId)
      && Number.isSafeInteger(row.quantity) && finite(row.quantity, 1) && typeof row.reason === 'string'
      && (row.reasonCode === undefined || typeof row.reasonCode === 'string'))
    && ['palletCount', 'loadedCargoWeightKg', 'totalPackagingWeightKg', 'avoidedPackagingWeightKg', 'packagedPalletCount',
      'totalPalletizedWeightKg', 'consolidatedPallets', 'lateralImbalanceKg', 'stackedPallets', 'maxUsedStackLevel'].every(key => finite(result[key]))
    && ['selectedStackTarget', 'candidateCount', 'floorPositions', 'consolidationPasses'].every(key => finite(optimization[key]))
    && typeof optimization.redistributedForLowUtilization === 'boolean'
    && (optimization.strategy === undefined || ['capacity', 'stability', 'unloading'].includes(optimization.strategy as string));
}

export function stagingMetadata(value: unknown): SavedStagingWorkspace | null {
  if (!record(value)) return null;
  const saved = value;
  if (saved.version !== 1 || !text(saved.scopeKey) || !text(saved.inputSignature)
    || typeof saved.mode !== 'string' || !['boxes', 'pallets', 'mixed'].includes(saved.mode) || !record(saved.identity)
    || !record(saved.identity.unitToStableId)
    || Object.entries(saved.identity.unitToStableId).some(([id, stableId]) => !text(id) || !text(stableId))
    || (saved.selectedUnitId !== null && !text(saved.selectedUnitId))) return null;
  if (saved.palletSnapshot !== undefined && !palletSnapshot(saved.palletSnapshot)) return null;
  if (saved.palletTypeId !== undefined && !text(saved.palletTypeId)) return null;
  if (saved.yardPallets !== undefined && (!Array.isArray(saved.yardPallets)
    || !saved.yardPallets.every(validSavedStagingPallet))) return null;
  return saved as SavedStagingWorkspace;
}

export function matchingStagingMetadata(value: unknown, input: StagingInput): SavedStagingWorkspace | null {
  const saved = stagingMetadata(value);
  return saved?.scopeKey === input.scopeKey && saved.mode === input.mode
    && saved.inputSignature === stagingInputSignature(input) ? saved : null;
}
