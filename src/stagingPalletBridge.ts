import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { MixedModePackingResult } from './engine/mixedModePacking';
import { validatePlacements } from './engine/constraints';
import { validateOperationalLoading } from './engine/operationalValidator';
import { palletAdvisoryFindings } from './engine/palletPlanValidation';
import { palletModelKey } from './palletModel';
import type { PalletSnapshot } from './palletSnapshotStore';
import type { ViewerSupport } from './viewerSceneProtocol';
import { createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import { buildPalletSecuringPlan } from './palletSecuringPlan';

export const STAGING_PALLET_PLAN_EVENT = 'container-loading:staging-pallet-plan';
export const STAGING_PALLET_READY_EVENT = 'container-loading:staging-pallet-ready';
export type StagingPalletPlanDetail = {
  inputKey: string;
  snapshot: PalletSnapshot;
  accepted: boolean;
  reasons?: string[];
};
type StagingPalletSupport = ViewerSupport & {
  modelKey: ReturnType<typeof palletModelKey>;
  unitCenterOfGravity: { x: number; y: number; z: number };
  unitHeightM: number;
};

/** Existing pallet scene arithmetic, shared by the panel and synchronous edits.
 * This creates scene data only; it never publishes, packs or certifies a plan. */
export function stagingPalletSceneData(container: ContainerSpec, cargo: CargoItem[], snapshot: PalletSnapshot):
  { result: LoadingResult; supports: StagingPalletSupport[] } {
  const result = snapshot.result as PalletSnapshot['result'] | MixedModePackingResult;
  const modelKey = palletModelKey(snapshot.spec);
  const supports = result.pallets.map(p => ({
    modelKey, id: 'PALLET-' + p.palletIndex,
    unitCenterOfGravity: p.centerOfGravity,
    unitHeightM: Math.max(p.height, ...p.cargoPlacements.map(box => box.z + box.height - p.z)) + p.packagingExtraHeightM,
    x: p.x, y: p.y, z: p.z, length: p.length, width: p.width, height: p.height,
    weightKg: Math.max(.01, p.totalWeightKg - p.cargoWeightKg),
    visualPackaging: { wrapping: p.wrappingUsed || p.bandingPlan?.wrapping === true,
      cornerGuards: p.cornerGuardsUsed || p.bandingPlan?.cornerGuards === true,
      bandingStraps: p.bandingPlan?.straps ?? 0 },
  }));
  return { supports, result: {
    ruleset: container.rules?.version, placements: result.placements, remaining: result.remaining,
    loadedWeightKg: 'mixed' in result ? result.mixed.totalLoadedWeightKg : result.totalPalletizedWeightKg,
    usedVolumeM3: result.placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0),
    validationIssues: validatePlacements(container, result.placements),
    operationalFindings: [...validateOperationalLoading(container, cargo, result.placements, supports),
      ...palletAdvisoryFindings(container, result, snapshot.spec)],
    ...('securingBudget' in result ? { securingBudget: result.securingBudget as LoadingResult['securingBudget'] } : {}),
  } };
}

/** The currently mounted owning panel validates synchronously and acknowledges.
 * No second pallet/inventory store is created by this command channel. */
export function publishStagingPalletPlan(inputKey: string, snapshot: PalletSnapshot): boolean {
  if (typeof window === 'undefined' || !inputKey) return false;
  const detail: StagingPalletPlanDetail = { inputKey, snapshot, accepted: false };
  window.dispatchEvent(new CustomEvent<StagingPalletPlanDetail>(STAGING_PALLET_PLAN_EVENT, { detail }));
  return detail.accepted;
}

/** Match effective job configuration without depending on object insertion order. */
export function sameStagingPalletSpec(a: PalletSnapshot['spec'], b: PalletSnapshot['spec']) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort() as Array<keyof PalletSnapshot['spec']>;
  return keys.every(key => a[key] === b[key]);
}

/** Copy only an actual, current securing plan's display count. A missing/stale
 * certificate never invents banding, and this metadata conveys no safety PASS. */
export function stagingPalletsWithBanding(container: ContainerSpec, cargo: CargoItem[], snapshot: PalletSnapshot,
  certification?: Pick<InertiaCertification, 'mode' | 'targetSignature' | 'securing'>) {
  const pallets = snapshot.result.pallets;
  if (!certification || certification.mode !== 'pallets') return pallets;
  const target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
  if (certification.targetSignature !== createPhysicsTargetSignature(target)) return pallets;
  const plans = new Map(buildPalletSecuringPlan(target, certification.securing).items.map(item => [item.palletIndex, item]));
  return pallets.map(load => {
    const item = plans.get(load.palletIndex); if (!item) return load;
    const plan = { straps: item.bandingStraps, securingLevel: certification.securing.level, wrapping: item.wrappingLengthM > 0, cornerGuards: item.cornerGuards > 0 };
    return JSON.stringify(plan) === JSON.stringify(load.bandingPlan) ? load : { ...load, bandingPlan: plan };
  });
}
