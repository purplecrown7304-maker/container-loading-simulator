import type { PhysicsSupport } from './engine/physicsValidation';
import type { Placement } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';
import { readSecuringMaterialSettings } from './securingMaterialSettings';

const EPS = 1e-6;

export type PalletSecuringPlanItem = {
  supportId: string;
  palletIndex: number;
  loadHeightM: number;
  bandingStraps: number;
  bandingLengthM: number;
  cornerGuards: number;
  cornerGuardLengthM: number;
  wrappingLengthM: number;
  antiSlipMats: number;
  estimatedAddedWeightKg: number;
};

export type PalletSecuringPlan = {
  items: PalletSecuringPlanItem[];
  sharedLoadBars: number;
  sharedLoadBarWeightKg: number;
  totalAddedWeightKg: number;
};

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function isAboveSupport(placement: Placement, support: PhysicsSupport) {
  const overlapX = overlap1d(placement.x, placement.x + placement.length, support.x, support.x + support.length);
  const overlapY = overlap1d(placement.y, placement.y + placement.width, support.y, support.y + support.width);
  const footprint = Math.max(EPS, placement.length * placement.width);
  return overlapX * overlapY / footprint >= 0.55 && placement.z + EPS >= support.z + support.height;
}

function supportLoadHeight(target: PhysicsTarget, support: PhysicsSupport) {
  const supports = target.supports ?? [];
  const upperSupportZ = supports
    .filter((candidate) => candidate !== support && candidate.z > support.z + EPS)
    .filter((candidate) => {
      const overlapX = overlap1d(candidate.x, candidate.x + candidate.length, support.x, support.x + support.length);
      const overlapY = overlap1d(candidate.y, candidate.y + candidate.width, support.y, support.y + support.width);
      return overlapX >= Math.min(candidate.length, support.length) * 0.8
        && overlapY >= Math.min(candidate.width, support.width) * 0.8;
    })
    .reduce((min, candidate) => Math.min(min, candidate.z), Number.POSITIVE_INFINITY);

  const supportTop = support.z + support.height;
  const top = target.result.placements
    .filter((placement) => isAboveSupport(placement, support))
    .filter((placement) => !Number.isFinite(upperSupportZ) || placement.z < upperSupportZ - EPS)
    .reduce((max, placement) => Math.max(max, placement.z + placement.height), supportTop);
  return Math.max(0, top - supportTop);
}

function palletIndexFromSupport(support: PhysicsSupport, fallback: number) {
  const match = support.id.match(/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

export function buildPalletSecuringPlan(target: PhysicsTarget, usage: SecuringUsage): PalletSecuringPlan {
  const unitWeights = usage.materialUnitWeights ?? readSecuringMaterialSettings();
  const supports = target.mode === 'pallets' ? (target.supports ?? []) : [];
  const level = usage.level;
  const strapsPerPallet = level === 0 ? 0 : level === 1 ? 2 : level === 2 ? 3 : 4;
  const antiSlipPerPallet = level === 0 ? 0 : level === 3 ? 2 : 1;

  const items = supports.map((support, index): PalletSecuringPlanItem => {
    const loadHeightM = supportLoadHeight(target, support);
    const bandingStraps = strapsPerPallet;
    const bandingLengthM = bandingStraps > 0
      ? bandingStraps * (2 * (Math.min(support.length, support.width) + loadHeightM) + 0.3)
      : 0;
    const cornerGuards = level > 0 ? 4 : 0;
    const cornerGuardLengthM = cornerGuards > 0 ? 4 * loadHeightM : 0;
    const wrappingLengthM = level >= 2 && loadHeightM > 0
      ? 2 * (support.length + support.width) * Math.max(3, Math.ceil(loadHeightM / 0.25) + 2) * 1.08
      : 0;
    const antiSlipMats = antiSlipPerPallet;
    const estimatedAddedWeightKg =
      bandingLengthM * unitWeights.bandingKgPerM
      + cornerGuardLengthM * unitWeights.cornerGuardKgPerM
      + wrappingLengthM * unitWeights.wrappingKgPerM
      + antiSlipMats * unitWeights.antiSlipKgPerEa;

    return {
      supportId: support.id,
      palletIndex: palletIndexFromSupport(support, index + 1),
      loadHeightM,
      bandingStraps,
      bandingLengthM,
      cornerGuards,
      cornerGuardLengthM,
      wrappingLengthM,
      antiSlipMats,
      estimatedAddedWeightKg,
    };
  });

  const sharedLoadBars = usage.loadBars;
  const sharedLoadBarWeightKg = sharedLoadBars * unitWeights.loadBarKgPerEa;
  return {
    items,
    sharedLoadBars,
    sharedLoadBarWeightKg,
    totalAddedWeightKg: items.reduce((sum, item) => sum + item.estimatedAddedWeightKg, 0) + sharedLoadBarWeightKg,
  };
}
