import { publishLoadSimAcceptance } from '../rule-engine/acceptance';
import { setNextPalletCenteredResultOverride } from './palletCentering';
import { type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './palletOptimization';
import type { ContainerSpec } from './types';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  createPhysicsTargetSignature,
  type InertiaCertification,
} from '../inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from '../physicsTarget';

const EPS = 1e-9;
const CENTERLINE_EPS = 1e-6;
const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

export type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
export type PalletAdaptiveCandidate = {
  label: string;
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
  target: PhysicsTarget;
  staticPenalty: number;
};
export type EvaluatedPalletCandidate = PalletAdaptiveCandidate & { certification: InertiaCertification; risk: number };

type PalletWindow = Window & {
  __containerLoadingPalletSnapshot?: PalletSnapshot;
  __containerLoadingLatestCertification?: InertiaCertification;
};

export function readPalletSnapshot(): PalletSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as PalletWindow).__containerLoadingPalletSnapshot;
}

export function calculateAdaptiveLateralImbalanceKg(
  pallets: Array<Pick<PalletLoad, 'centerOfGravity' | 'totalWeightKg'>>,
  container: ContainerSpec,
) {
  let left = 0;
  let right = 0;
  for (const pallet of pallets) {
    const delta = pallet.centerOfGravity.y - container.width / 2;
    if (Math.abs(delta) < CENTERLINE_EPS) continue;
    if (delta < 0) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
  return Math.abs(left - right);
}

/** A is the only container planner. Legacy recentering/height/rotation retry candidates were removed. */
export function buildPalletAdaptiveCandidates(
  _current: PhysicsTarget,
  _snapshot: PalletSnapshot,
  _limit = Number.POSITIVE_INFINITY,
): PalletAdaptiveCandidate[] {
  return [];
}

export function baselinePalletCandidate(current: PhysicsTarget, snapshot: PalletSnapshot): PalletAdaptiveCandidate {
  return {
    label: '현재 팔레트 적재안',
    spec: snapshot.spec,
    result: snapshot.result,
    target: current,
    staticPenalty: 0,
  };
}

export function palletCertificationRisk(result: InertiaCertification) {
  const shift = result.maxHorizontalShiftM / Math.max(EPS, INERTIA_PASS_SHIFT_M);
  const tilt = result.maxTiltDeg / Math.max(EPS, INERTIA_PASS_TILT_DEG);
  const slip = (result.maxCargoRelativeSlipM ?? 0) / Math.max(EPS, INERTIA_PASS_PALLET_CARGO_SLIP_M);
  const support = (result.maxSupportShiftM ?? 0) / Math.max(EPS, INERTIA_PASS_SUPPORT_SHIFT_M);
  return Math.max(shift, tilt, slip, support) + (shift + tilt + slip + support) * 0.15 + result.securing.level * 0.03;
}

export function betterPalletEvaluation(a: EvaluatedPalletCandidate, b: EvaluatedPalletCandidate) {
  if (Math.abs(a.risk - b.risk) > 1e-6) return a.risk < b.risk;
  if (a.certification.securing.level !== b.certification.securing.level) return a.certification.securing.level < b.certification.securing.level;
  if ((!a.result.optimization.strategy || a.result.optimization.strategy === 'stability')
    && a.result.stackedPallets !== b.result.stackedPallets) return a.result.stackedPallets < b.result.stackedPallets;
  if (Math.abs(a.staticPenalty - b.staticPenalty) > 1e-6) return a.staticPenalty < b.staticPenalty;
  return a.result.palletCount < b.result.palletCount;
}

function publishCertification(certification: InertiaCertification) {
  (window as PalletWindow).__containerLoadingLatestCertification = certification;
  window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
}

export function applyPalletAdaptiveCandidate(candidate: PalletAdaptiveCandidate, certification: InertiaCertification) {
  const snapshot: PalletSnapshot = { spec: candidate.spec, result: candidate.result };
  const state = window as PalletWindow;
  state.__containerLoadingPalletSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent<PalletSnapshot>(PALLET_SNAPSHOT_UPDATED_EVENT, { detail: snapshot }));
  if (candidate.target.result.ruleEngine === 'load-sim') publishLoadSimAcceptance(candidate.target);
  else publishPhysicsTarget(candidate.target);
  publishCertification(certification);
  setNextPalletCenteredResultOverride(candidate.result);
  window.dispatchEvent(new CustomEvent<PalletSpec>(PALLET_SPEC_FROM_RESULTS_EVENT, { detail: candidate.spec }));

  const restore = () => {
    const target = readPhysicsTarget();
    if (target && createPhysicsTargetSignature(target) === certification.targetSignature) publishCertification(certification);
  };
  window.setTimeout(restore, 80);
  window.setTimeout(restore, 250);
}
