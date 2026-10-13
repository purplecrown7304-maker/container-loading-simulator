import { completeSecuredPhysicsValidation } from './securedPhysicsCertification';
import { resolveLimitReview, reviewPlacementBlockers } from './engine/limitReview';
import type { InertiaAnimationResult, InertiaSecuringProfile } from './engine/inertiaSimulation';
import { createInertiaRunSession, inertiaTargetKey, waitForInertiaRun, type InertiaRunHandle } from './inertiaScenarioRuns';
import type { PhysicsScenario, PhysicsSupport, PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LimitReviewConfig, LoadingResult, Placement } from './engine/types';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readSecuringMaterialSettings, type SecuringMaterialSettings } from './securingMaterialSettings';
import { palletBandingLengthM } from './palletBanding';
import { boxSecuringRequirements } from './engine/securingBudget';
import { fixedGapSupports, gapSecuringPlan } from './engine/gapSecuring';
import { usesHeavyInnerLoading } from './engine/heavyInnerPolicy';

export type InertiaScenario = Exclude<PhysicsScenario, 'settle'>;
export type CertificationStatus = 'passed' | 'failed' | 'review';
export type SecuringLevel = 0 | 1 | 2 | 3;

export type SecuringUsage = {
  level: SecuringLevel;
  levelLabel: string;
  palletCount: number;
  palletWeightKg: number;
  bandingStraps: number;
  bandingLengthM: number;
  cornerGuards: number;
  cornerGuardLengthM: number;
  wrappingLengthM: number;
  antiSlipMats: number;
  dunnageBlocks: number;
  loadBars: number;
  estimatedAddedWeightKg: number;
  estimatedNonCargoWeightKg: number;
  materialUnitWeights?: SecuringMaterialSettings;
};

export type InertiaAttemptScenario = {
  scenario: InertiaScenario;
  passed: boolean;
  maxHorizontalShiftM: number;
  maxTiltDeg: number;
  maxCargoRelativeSlipM?: number;
  maxSupportShiftM?: number;
};

export type InertiaReinforcementAttempt = {
  level: SecuringLevel;
  levelLabel: string;
  payloadWithinLimit: boolean;
  passed: boolean;
  scenarios: InertiaAttemptScenario[];
};

export type InertiaCertification = {
  /** Full motion/bounds checks in the exact selected securing world. Legacy records remain review-only. */
  physicsValidation?: PhysicsValidationSuite;
  physicsValidationSignature?: string;
  /** Persistent review provenance: never eligible for dispatch/PASS. */
  limitReview?: LimitReviewConfig;
  /** Discloses a bounded or operator-stopped optional layout search on the work order. */
  searchNotice?: string;
  status: CertificationStatus;
  mode: PhysicsTarget['mode'];
  targetSignature: string;
  testedAt: string;
  securing: SecuringUsage;
  testedScenarios: number;
  passedScenarios: number;
  failedScenarios: InertiaScenario[];
  maxHorizontalShiftM: number;
  maxTiltDeg: number;
  maxCargoRelativeSlipM?: number;
  maxSupportShiftM?: number;
  maxCargoRestraintForceN?: number;
  maxSupportRestraintForceN?: number;
  results: Partial<Record<InertiaScenario, InertiaAnimationResult>>;
  payloadWithinLimit: boolean;
  attempts?: InertiaReinforcementAttempt[];
};

export type CertificationRequestDetail = {
  /** Automatic loading finishes on the main canvas; manual requests may open a result dialog. */
  automatic?: boolean;
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
};

export type CertificationProgress = {
  stage?: 'secured-physics';
  level: SecuringLevel;
  levelLabel: string;
  scenario: PhysicsScenario;
  scenarioIndex: number;
  scenarioCount: number;
  physicsProgress: number;
};

export const REQUEST_CERTIFIED_RESULTS_EVENT = 'container-loading:request-certified-results';
export const INERTIA_CERTIFICATION_EVENT = 'container-loading:inertia-certification-result';

export const INERTIA_PASS_SHIFT_M = 0.012;
export const INERTIA_PASS_TILT_DEG = 1.8;
export const INERTIA_PASS_PALLET_CARGO_SLIP_M = 0.008;
export const INERTIA_PASS_SUPPORT_SHIFT_M = 0.012;

const SCENARIOS: InertiaScenario[] = ['acceleration', 'braking', 'cornering'];
const EPS = 1e-6;

type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

const LEVEL_LABEL: Record<SecuringLevel, string> = {
  0: '보조 고정 없음',
  1: '1차 보강 · 기본 고정',
  2: '2차 보강 · 강화 고정',
  3: '3차 보강 · 최대 결속',
};

export function minimumSecuringLevelForMode(mode: PhysicsTarget['mode']): SecuringLevel {
  return mode === 'pallets' ? 1 : 1;
}

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
    .filter(candidate => candidate !== support && candidate.z > support.z + EPS)
    .filter(candidate => {
      const overlapX = overlap1d(candidate.x, candidate.x + candidate.length, support.x, support.x + support.length);
      const overlapY = overlap1d(candidate.y, candidate.y + candidate.width, support.y, support.y + support.width);
      return overlapX >= Math.min(candidate.length, support.length) * 0.8 && overlapY >= Math.min(candidate.width, support.width) * 0.8;
    })
    .reduce((min, candidate) => Math.min(min, candidate.z), Number.POSITIVE_INFINITY);

  const supportTop = support.z + support.height;
  const top = target.result.placements
    .filter(placement => isAboveSupport(placement, support))
    .filter(placement => !Number.isFinite(upperSupportZ) || placement.z < upperSupportZ - EPS)
    .reduce((max, placement) => Math.max(max, placement.z + placement.height), supportTop);
  return Math.max(0, top - supportTop);
}

export function createPhysicsTargetSignature(target: PhysicsTarget) {
  const cargo = [...target.cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [
      item.id,
      item.name,
      item.length,
      item.width,
      item.height,
      item.weightKg,
      item.quantity,
      item.maxStackLayers ?? null,
      item.maxTopLoadKg ?? null,
      item.allowRotation !== false,
      item.unloadPriority ?? null,
      item.allowedOrientations?.slice().sort() ?? null,
      item.thisSideUp ?? null,
    ]);
  const remaining = [...target.result.remaining]
    .sort((a, b) => a.cargoId.localeCompare(b.cargoId) || a.quantity - b.quantity || a.reason.localeCompare(b.reason))
    .map(item => [item.cargoId, item.quantity, item.reason]);
  return JSON.stringify({
    physicsModel: 'restraint-v7-stepped-door-faces',
    limitReview: target.container.limitReview ?? target.result.limitReview?.config,
    rulesMetadata: target.container.rules ? { cargo: target.cargo, ruleset: target.result.ruleset, orientation: target.result.placements.map(p=>[p.unitId,p.orientation]) } : undefined,
    bandingLayout: target.mode === 'pallets' ? 'grid-v1' : undefined,
    mode: target.mode,
    container: target.container,
    cargo,
    placements: target.result.placements.map(item => [item.cargoId, item.x, item.y, item.z, item.length, item.width, item.height, item.weightKg, item.rotated === true]),
    remaining,
    supports: (target.supports ?? []).map(item => [item.id, item.x, item.y, item.z, item.length, item.width, item.height, item.weightKg, item.dynamic !== false]),
    materialUnitWeights: readSecuringMaterialSettings(),
  });
}

export function readLatestInertiaCertification() {
  if (typeof window === 'undefined') return undefined;
  return (window as CertificationWindow).__containerLoadingLatestCertification;
}

export function clearLatestInertiaCertification() {
  if (typeof window === 'undefined') return;
  (window as CertificationWindow).__containerLoadingLatestCertification = undefined;
  window.dispatchEvent(new CustomEvent<InertiaCertification | undefined>(INERTIA_CERTIFICATION_EVENT, { detail: undefined }));
}

export function requestCertifiedResults(detail: CertificationRequestDetail) {
  window.dispatchEvent(new CustomEvent<CertificationRequestDetail>(REQUEST_CERTIFIED_RESULTS_EVENT, { detail }));
}

export function isInertiaStable(result: InertiaAnimationResult, mode: PhysicsTarget['mode'] = 'boxes') {
  const metrics = [result.maxHorizontalShiftM, result.maxTiltDeg];
  if (mode === 'pallets') metrics.push(result.maxCargoRelativeSlipM ?? result.maxHorizontalShiftM, result.maxSupportShiftM ?? 0);
  if (!metrics.every(value => Number.isFinite(value) && value >= 0)) return false;
  if (result.maxHorizontalShiftM > INERTIA_PASS_SHIFT_M || result.maxTiltDeg > INERTIA_PASS_TILT_DEG) return false;
  if (mode === 'pallets') {
    if ((result.maxCargoRelativeSlipM ?? result.maxHorizontalShiftM) > INERTIA_PASS_PALLET_CARGO_SLIP_M) return false;
    if ((result.maxSupportShiftM ?? 0) > INERTIA_PASS_SUPPORT_SHIFT_M) return false;
  }
  return true;
}

export function securingProfileForUsage(mode: PhysicsTarget['mode'], usage: SecuringUsage): InertiaSecuringProfile {
  if (usage.level === 0) return { frictionCoefficient: 0.62 };

  if (mode === 'pallets') {
    const strapsPerPallet = usage.palletCount > 0 ? usage.bandingStraps / usage.palletCount : 0;
    const hasWrap = usage.wrappingLengthM > EPS;
    const hasAntiSlip = usage.antiSlipMats > 0;
    const cargoCapacityG = Math.min(0.78, Math.max(0.12, strapsPerPallet * 0.11 + (hasWrap ? 0.14 : 0)));
    const cargoSpring = 8 + strapsPerPallet * 4.5 + (hasWrap ? 7 : 0);
    const cargoDamping = 3 + strapsPerPallet * 0.8 + (hasWrap ? 1.5 : 0);
    return {
      frictionCoefficient: hasAntiSlip ? (usage.antiSlipMats > usage.palletCount ? 0.82 : 0.74) : 0.62,
      cargoRestraint: strapsPerPallet > 0 || hasWrap ? {
        springAccelerationPerM: cargoSpring,
        dampingPerSecond: cargoDamping,
        maxAccelerationG: cargoCapacityG,
      } : undefined,
      // Generic bar counts have no installation evidence. They cannot supply an
      // invisible pallet-to-container spring, including in old saved usage records.
      // Pallet banding/wrap and floor friction remain modelled above.
      supportRestraint: undefined,
    };
  }

  const hasAntiSlip = usage.antiSlipMats > 0;
  const blockingStrength = usage.dunnageBlocks * 0.035;
  // Actual eligible void-fill/door bars act through buildInertiaSimulationSupports.
  // Do not also credit unlocated generic bars with a virtual spring or damping.
  const capacityG = Math.min(0.62, blockingStrength);
  return {
    frictionCoefficient: hasAntiSlip ? (usage.level >= 3 ? 0.88 : 0.76) : 0.62,
    cargoRestraint: capacityG > 0 ? {
      springAccelerationPerM: 7 + usage.dunnageBlocks * 1.3,
      dampingPerSecond: 3 + usage.dunnageBlocks * 0.18,
      maxAccelerationG: capacityG,
    } : undefined,
  };
}

/** Use the same material snapshot for initial and work-order completion scenarios. */
export function buildInertiaSimulationSupports(target: PhysicsTarget, usage: SecuringUsage): PhysicsSupport[] {
  const supports = target.supports ?? [];
  const approvedDirectBox = target.mode === 'boxes' && usesHeavyInnerLoading(target.container, target.cargo);
  if (!approvedDirectBox) return supports;
  const gapPlan = gapSecuringPlan(target.container, target.result.placements, usage.materialUnitWeights);
  return [...supports, ...fixedGapSupports(gapPlan)];
}

export function buildSecuringUsage(target: PhysicsTarget, level: SecuringLevel): SecuringUsage {
  const supports = target.mode === 'pallets' ? (target.supports ?? []) : [];
  const palletCount = supports.length;
  const palletWeightKg = supports.reduce((sum, support) => sum + Math.max(0, support.weightKg), 0);
  const unitWeights = readSecuringMaterialSettings();

  let bandingStraps = 0;
  let bandingLengthM = 0;
  let cornerGuards = 0;
  let cornerGuardLengthM = 0;
  let wrappingLengthM = 0;
  let antiSlipMats = 0;
  let dunnageBlocks = 0;
  let loadBars = 0;

  if (target.mode === 'pallets' && level > 0) {
    const strapsPerPallet = level === 1 ? 2 : level === 2 ? 3 : 4;
    bandingStraps = palletCount * strapsPerPallet;
    cornerGuards = palletCount * 4;
    antiSlipMats = palletCount * (level === 3 ? 2 : 1);
    // Generic load bars have no verified span or anchoring model; do not install them automatically.

    supports.forEach(support => {
      const loadHeight = supportLoadHeight(target, support);
      bandingLengthM += palletBandingLengthM(support.length, support.width, loadHeight, strapsPerPallet);
      cornerGuardLengthM += 4 * loadHeight;
      if (loadHeight > 0) {
        const wrapCircumference = 2 * (support.length + support.width);
        const verticalTurns = level === 1
          ? Math.max(3, Math.ceil(loadHeight / 0.35) + 1)
          : Math.max(3, Math.ceil(loadHeight / 0.25) + 2);
        wrappingLengthM += wrapCircumference * verticalTurns * (level === 1 ? 1.04 : 1.08);
      }
    });
  } else if (target.mode === 'boxes' && level > 0) {
    const required = boxSecuringRequirements(target.result.placements.length, level as 1 | 2 | 3, unitWeights);
    antiSlipMats = required.antiSlipMats;
    dunnageBlocks = required.dunnageBlocks;
    loadBars = required.loadBars;
  }

  const countBasedWeightKg =
    bandingLengthM * unitWeights.bandingKgPerM +
    cornerGuardLengthM * unitWeights.cornerGuardKgPerM +
    wrappingLengthM * unitWeights.wrappingKgPerM +
    antiSlipMats * unitWeights.antiSlipKgPerEa +
    dunnageBlocks * unitWeights.dunnageKgPerEa +
    loadBars * unitWeights.loadBarKgPerEa;
  const approvedDirectBox = target.mode === 'boxes' && usesHeavyInnerLoading(target.container, target.cargo);
  const voidPlan = approvedDirectBox && level > 0
    ? gapSecuringPlan(target.container, target.result.placements, unitWeights)
    : undefined;
  const estimatedAddedWeightKg = Math.max(countBasedWeightKg, voidPlan?.weightKg ?? 0);

  return {
    level,
    levelLabel: target.mode === 'pallets' && level > 0
      ? level === 1 ? '기본 운송 고정 · 밴딩+각대+랩핑' : level === 2 ? '2차 보강 · 강화 밴딩+각대+랩핑' : '3차 보강 · 최대 결속'
      : target.mode === 'boxes' && level > 0
        ? level === 1 ? '기본 운송 고정 · 미끄럼방지+블로킹' : level === 2 ? '2차 보강 · 강화 고정' : '3차 보강 · 최대 블로킹'
        : LEVEL_LABEL[level],
    palletCount,
    palletWeightKg,
    bandingStraps,
    bandingLengthM,
    cornerGuards,
    cornerGuardLengthM,
    wrappingLengthM,
    antiSlipMats,
    dunnageBlocks,
    loadBars,
    estimatedAddedWeightKg,
    estimatedNonCargoWeightKg: palletWeightKg + estimatedAddedWeightKg,
    materialUnitWeights: unitWeights,
  };
}

function payloadWithinLimit(target: PhysicsTarget, usage: SecuringUsage) {
  return target.result.loadedWeightKg + usage.estimatedAddedWeightKg <= target.container.maxPayloadKg + 1e-9;
}

/** Numerical review is allowed only for a valid, scenario-feasible direct-box layout. */
export function isNumericalLimitReviewTarget(target: PhysicsTarget): boolean {
  return target.mode === 'boxes' && resolveLimitReview(target.container, target.cargo).status === 'active'
    && reviewPlacementBlockers(target.container, target.cargo, target.result.placements).length === 0;
}


export async function runInertiaCertification(
  target: PhysicsTarget,
  onProgress?: (progress: CertificationProgress) => void,
  onScenarioResult?: (result: InertiaAnimationResult, level: SecuringLevel) => void,
  shouldCancel?: () => boolean,
): Promise<InertiaCertification> {
  // The three scenarios of a level are started together on the worker pool and read back in the
  // fixed order below. Intermediate levels may stop early, but the final level must record
  // all three scenarios so a failed run still has complete, actionable evidence.
  const session = createInertiaRunSession();
  const targetKey = inertiaTargetKey(target.container, target.result.placements);
  let completed = false;
  try {
    const certification = await certifyLevels(target, session, targetKey, onProgress, onScenarioResult, shouldCancel);
    completed = true;
    return certification;
  } finally {
    session.release({ abortAll: !completed });
  }
}

async function certifyLevels(
  target: PhysicsTarget,
  session: ReturnType<typeof createInertiaRunSession>,
  targetKey: string,
  onProgress?: (progress: CertificationProgress) => void,
  onScenarioResult?: (result: InertiaAnimationResult, level: SecuringLevel) => void,
  shouldCancel?: () => boolean,
): Promise<InertiaCertification> {
  const limitReview = target.container.limitReview ?? target.result.limitReview?.config;
  const numericalReview = isNumericalLimitReviewTarget(target);
  let finalResults: Partial<Record<InertiaScenario, InertiaAnimationResult>> = {};
  const minimumLevel = minimumSecuringLevelForMode(target.mode);
  let finalLevel: SecuringLevel = minimumLevel;
  const attempts: InertiaReinforcementAttempt[] = [];

  for (let rawLevel = minimumLevel; rawLevel <= 3; rawLevel += 1) {
    if (shouldCancel?.()) throw new Error('INERTIA_CERTIFICATION_CANCELLED');
    if (limitReview && !numericalReview) break;
    const level = rawLevel as SecuringLevel;
    const securing = buildSecuringUsage(target, level);
    const scenarioPayloadOk = !numericalReview || target.result.loadedWeightKg + securing.estimatedAddedWeightKg
      <= (limitReview?.maxPayloadKg ?? target.container.maxPayloadKg) + 1e-9;
    if (!scenarioPayloadOk) {
      attempts.push({ level, levelLabel: securing.levelLabel, payloadWithinLimit: payloadWithinLimit(target, securing), passed: false, scenarios: [] });
      break;
    }
    finalLevel = level;
    const payloadOk = payloadWithinLimit(target, securing);
    if (!payloadOk && !numericalReview) {
      attempts.push({ level, levelLabel: securing.levelLabel, payloadWithinLimit: false, passed: false, scenarios: [] });
      finalResults = {};
      break;
    }

    const profile = securingProfileForUsage(target.mode, securing);
    const simulationSupports = buildInertiaSimulationSupports(target, securing);
    const levelResults: Partial<Record<InertiaScenario, InertiaAnimationResult>> = {};
    let allPassed = true;

    const runs: InertiaRunHandle[] = SCENARIOS.map(scenario => session.start(targetKey, {
      container: target.container, placements: target.result.placements, scenario, supports: simulationSupports, securing: profile,
    }));
    // The last level is the one the work-order completion step fills in; keep its runs.
    if (rawLevel === 3) runs.forEach(run => run.keep());
    let consumed = 0;
    for (let index = 0; index < SCENARIOS.length; index += 1) {
      if (shouldCancel?.()) throw new Error('INERTIA_CERTIFICATION_CANCELLED');
      const scenario = SCENARIOS[index];
      const result = await waitForInertiaRun(runs[index], value => onProgress?.({
        level,
        levelLabel: securing.levelLabel,
        scenario,
        scenarioIndex: index + 1,
        scenarioCount: SCENARIOS.length,
        physicsProgress: value,
      }), shouldCancel, 'INERTIA_CERTIFICATION_CANCELLED');
      consumed = index + 1;
      levelResults[scenario] = result;
      onScenarioResult?.(result, level);
      if (!isInertiaStable(result, target.mode)) {
        allPassed = false;
        if (!numericalReview && rawLevel < 3) break;
      }
    }
    // Scenarios after an early stop are not recorded; free their workers unless kept.
    for (const run of runs.slice(consumed)) run.drop();

    const scenarioAttempts = SCENARIOS.flatMap(scenario => {
      const result = levelResults[scenario];
      return result ? [{
        scenario,
        passed: isInertiaStable(result, target.mode),
        maxHorizontalShiftM: result.maxHorizontalShiftM,
        maxTiltDeg: result.maxTiltDeg,
        maxCargoRelativeSlipM: result.maxCargoRelativeSlipM,
        maxSupportShiftM: result.maxSupportShiftM,
      } satisfies InertiaAttemptScenario] : [];
    });
    const levelPassed = allPassed && scenarioAttempts.length === SCENARIOS.length;
    attempts.push({
      level,
      levelLabel: securing.levelLabel,
      payloadWithinLimit: payloadOk,
      passed: levelPassed && payloadOk,
      scenarios: scenarioAttempts,
    });

    finalResults = levelResults;
    if (levelPassed) break;
  }

  if (shouldCancel?.()) throw new Error('INERTIA_CERTIFICATION_CANCELLED');
  const usage = buildSecuringUsage(target, finalLevel);
  const failedScenarios = SCENARIOS.filter(scenario => {
    const result = finalResults[scenario];
    return !result || !isInertiaStable(result, target.mode);
  });
  const results = Object.values(finalResults).filter((result): result is InertiaAnimationResult => Boolean(result));
  const payloadOk = payloadWithinLimit(target, usage);
  const passed = failedScenarios.length === 0 && results.length === SCENARIOS.length && payloadOk;

  let certification: InertiaCertification = {
    status: passed ? (limitReview ? 'review' : 'passed') : 'failed',
    limitReview,
    mode: target.mode,
    targetSignature: createPhysicsTargetSignature(target),
    testedAt: new Date().toISOString(),
    securing: usage,
    testedScenarios: results.length,
    passedScenarios: results.filter(result => isInertiaStable(result, target.mode)).length,
    failedScenarios,
    maxHorizontalShiftM: results.reduce((max, result) => Math.max(max, result.maxHorizontalShiftM), 0),
    maxTiltDeg: results.reduce((max, result) => Math.max(max, result.maxTiltDeg), 0),
    maxCargoRelativeSlipM: results.reduce((max, result) => Math.max(max, result.maxCargoRelativeSlipM ?? 0), 0),
    maxSupportShiftM: results.reduce((max, result) => Math.max(max, result.maxSupportShiftM ?? 0), 0),
    maxCargoRestraintForceN: results.reduce((max, result) => Math.max(max, result.maxCargoRestraintForceN ?? 0), 0),
    maxSupportRestraintForceN: results.reduce((max, result) => Math.max(max, result.maxSupportRestraintForceN ?? 0), 0),
    results: finalResults,
    payloadWithinLimit: payloadOk,
    attempts,
  };

  certification = await completeSecuredPhysicsValidation(target, certification, onProgress, shouldCancel);

  if (typeof window !== 'undefined') {
    const currentTarget = readPhysicsTarget();
    if (currentTarget && createPhysicsTargetSignature(currentTarget) === certification.targetSignature) {
      (window as CertificationWindow).__containerLoadingLatestCertification = certification;
      window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
    }
  }
  return certification;
}
