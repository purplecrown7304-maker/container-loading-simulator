import type { InertiaAnimationResult, InertiaSecuringProfile } from './engine/inertiaSimulation';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import type { PhysicsScenario, PhysicsSupport } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import type { PhysicsTarget } from './physicsTarget';

export type InertiaScenario = Exclude<PhysicsScenario, 'settle'>;
export type CertificationStatus = 'passed' | 'failed';
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
};

export type InertiaCertification = {
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
  results: Partial<Record<InertiaScenario, InertiaAnimationResult>>;
  payloadWithinLimit: boolean;
};

export type CertificationRequestDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
};

export type CertificationProgress = {
  level: SecuringLevel;
  levelLabel: string;
  scenario: InertiaScenario;
  scenarioIndex: number;
  scenarioCount: number;
  physicsProgress: number;
};

export const REQUEST_CERTIFIED_RESULTS_EVENT = 'container-loading:request-certified-results';
export const INERTIA_CERTIFICATION_EVENT = 'container-loading:inertia-certification-result';

export const INERTIA_PASS_SHIFT_M = 0.012;
export const INERTIA_PASS_TILT_DEG = 1.8;

const SCENARIOS: InertiaScenario[] = ['acceleration', 'braking', 'cornering'];
const EPS = 1e-6;

type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

const LEVEL_LABEL: Record<SecuringLevel, string> = {
  0: '보조 고정 없음',
  1: '1차 보강 · 기본 고정',
  2: '2차 보강 · 강화 고정',
  3: '3차 보강 · 최대 결속',
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
  return JSON.stringify({
    mode: target.mode,
    container: target.container,
    placements: target.result.placements.map(item => [item.cargoId, item.x, item.y, item.z, item.length, item.width, item.height, item.weightKg]),
    supports: (target.supports ?? []).map(item => [item.id, item.x, item.y, item.z, item.length, item.width, item.height, item.weightKg]),
  });
}

export function readLatestInertiaCertification() {
  if (typeof window === 'undefined') return undefined;
  return (window as CertificationWindow).__containerLoadingLatestCertification;
}

export function clearLatestInertiaCertification() {
  if (typeof window === 'undefined') return;
  (window as CertificationWindow).__containerLoadingLatestCertification = undefined;
}

export function requestCertifiedResults(detail: CertificationRequestDetail) {
  window.dispatchEvent(new CustomEvent<CertificationRequestDetail>(REQUEST_CERTIFIED_RESULTS_EVENT, { detail }));
}

export function isInertiaStable(result: InertiaAnimationResult) {
  return result.maxHorizontalShiftM <= INERTIA_PASS_SHIFT_M && result.maxTiltDeg <= INERTIA_PASS_TILT_DEG;
}

export function securingProfileForLevel(mode: PhysicsTarget['mode'], level: SecuringLevel): InertiaSecuringProfile {
  if (level === 0) return { frictionCoefficient: 0.62, cargoRetentionRatio: 0, supportRetentionRatio: 0 };
  if (mode === 'pallets') {
    if (level === 1) return { frictionCoefficient: 0.74, cargoRetentionRatio: 0.36, supportRetentionRatio: 0.16 };
    if (level === 2) return { frictionCoefficient: 0.84, cargoRetentionRatio: 0.58, supportRetentionRatio: 0.30 };
    return { frictionCoefficient: 0.92, cargoRetentionRatio: 0.78, supportRetentionRatio: 0.48 };
  }
  if (level === 1) return { frictionCoefficient: 0.72, cargoRetentionRatio: 0.16, supportRetentionRatio: 0 };
  if (level === 2) return { frictionCoefficient: 0.82, cargoRetentionRatio: 0.34, supportRetentionRatio: 0 };
  return { frictionCoefficient: 0.90, cargoRetentionRatio: 0.54, supportRetentionRatio: 0 };
}

export function buildSecuringUsage(target: PhysicsTarget, level: SecuringLevel): SecuringUsage {
  const supports = target.mode === 'pallets' ? (target.supports ?? []) : [];
  const palletCount = supports.length;
  const palletWeightKg = supports.reduce((sum, support) => sum + Math.max(0, support.weightKg), 0);

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
    loadBars = level === 3 && palletCount > 0 ? 2 : 0;

    supports.forEach(support => {
      const loadHeight = supportLoadHeight(target, support);
      const strapRun = 2 * (Math.min(support.length, support.width) + loadHeight) + 0.3;
      bandingLengthM += strapsPerPallet * strapRun;
      cornerGuardLengthM += 4 * loadHeight;
      if (level >= 2 && loadHeight > 0) {
        const wrapCircumference = 2 * (support.length + support.width);
        const verticalTurns = Math.max(3, Math.ceil(loadHeight / 0.25) + 2);
        wrappingLengthM += wrapCircumference * verticalTurns * 1.08;
      }
    });
  } else if (target.mode === 'boxes' && level > 0) {
    const boxCount = Math.max(1, target.result.placements.length);
    antiSlipMats = Math.max(2, Math.ceil(boxCount / (level === 1 ? 30 : 20)));
    dunnageBlocks = Math.max(level === 1 ? 2 : level === 2 ? 4 : 6, Math.ceil(boxCount / 80) * 2);
    loadBars = level >= 2 ? 2 : 0;
  }

  // 실제 자재 규격이 입력되기 전까지 결과 비교용 보수적 기본 단위중량을 사용한다.
  const estimatedAddedWeightKg =
    bandingLengthM * 0.025 +
    cornerGuardLengthM * 0.12 +
    wrappingLengthM * 0.018 +
    antiSlipMats * 0.35 +
    dunnageBlocks * 0.75 +
    loadBars * 4.5;

  return {
    level,
    levelLabel: target.mode === 'pallets' && level > 0
      ? level === 1 ? '1차 보강 · 밴딩+각대' : level === 2 ? '2차 보강 · 밴딩+각대+랩핑' : '3차 보강 · 최대 결속'
      : target.mode === 'boxes' && level > 0
        ? level === 1 ? '1차 보강 · 미끄럼방지+블로킹' : level === 2 ? '2차 보강 · 블로킹+고정바' : '3차 보강 · 최대 블로킹'
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
  };
}

function payloadWithinLimit(target: PhysicsTarget, usage: SecuringUsage) {
  return target.result.loadedWeightKg + usage.estimatedAddedWeightKg <= target.container.maxPayloadKg + 1e-9;
}

export async function runInertiaCertification(
  target: PhysicsTarget,
  onProgress?: (progress: CertificationProgress) => void,
  onScenarioResult?: (result: InertiaAnimationResult, level: SecuringLevel) => void,
): Promise<InertiaCertification> {
  let finalResults: Partial<Record<InertiaScenario, InertiaAnimationResult>> = {};
  let finalLevel: SecuringLevel = 0;

  for (let rawLevel = 0; rawLevel <= 3; rawLevel += 1) {
    const level = rawLevel as SecuringLevel;
    const securing = buildSecuringUsage(target, level);
    finalLevel = level;
    if (!payloadWithinLimit(target, securing)) {
      finalResults = {};
      break;
    }

    const profile = securingProfileForLevel(target.mode, level);
    const levelResults: Partial<Record<InertiaScenario, InertiaAnimationResult>> = {};
    let allPassed = true;

    for (let index = 0; index < SCENARIOS.length; index += 1) {
      const scenario = SCENARIOS[index];
      const result = await runInertiaAnimation(
        target.container,
        target.result.placements,
        scenario,
        target.supports ?? [],
        value => onProgress?.({
          level,
          levelLabel: securing.levelLabel,
          scenario,
          scenarioIndex: index + 1,
          scenarioCount: SCENARIOS.length,
          physicsProgress: value,
        }),
        profile,
      );
      levelResults[scenario] = result;
      onScenarioResult?.(result, level);
      if (!isInertiaStable(result)) {
        allPassed = false;
        break;
      }
    }

    finalResults = levelResults;
    if (allPassed && Object.keys(levelResults).length === SCENARIOS.length) break;
  }

  const usage = buildSecuringUsage(target, finalLevel);
  const failedScenarios = SCENARIOS.filter(scenario => {
    const result = finalResults[scenario];
    return !result || !isInertiaStable(result);
  });
  const results = Object.values(finalResults).filter((result): result is InertiaAnimationResult => Boolean(result));
  const payloadOk = payloadWithinLimit(target, usage);
  const passed = failedScenarios.length === 0 && results.length === SCENARIOS.length && payloadOk;

  const certification: InertiaCertification = {
    status: passed ? 'passed' : 'failed',
    mode: target.mode,
    targetSignature: createPhysicsTargetSignature(target),
    testedAt: new Date().toISOString(),
    securing: usage,
    testedScenarios: results.length,
    passedScenarios: results.filter(isInertiaStable).length,
    failedScenarios,
    maxHorizontalShiftM: results.reduce((max, result) => Math.max(max, result.maxHorizontalShiftM), 0),
    maxTiltDeg: results.reduce((max, result) => Math.max(max, result.maxTiltDeg), 0),
    results: finalResults,
    payloadWithinLimit: payloadOk,
  };

  if (typeof window !== 'undefined') {
    (window as CertificationWindow).__containerLoadingLatestCertification = certification;
    window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
  }
  return certification;
}
