import type { InertiaAnimationResult, InertiaSecuringProfile } from './engine/inertiaSimulation';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import type { PhysicsScenario } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
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
  wrappingLengthM: number;
  antiSlipMats: number;
  loadBars: number;
  estimatedAddedWeightKg: number;
  estimatedNonCargoWeightKg: number;
};

export type InertiaCertification = {
  status: CertificationStatus;
  mode: PhysicsTarget['mode'];
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

const LEVEL_LABEL: Record<SecuringLevel, string> = {
  0: '보조 고정 없음',
  1: '1차 보강 · 밴딩+각대',
  2: '2차 보강 · 밴딩+각대+랩핑',
  3: '3차 보강 · 최대 결속',
};

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
  if (level === 1) return { frictionCoefficient: 0.70, cargoRetentionRatio: 0.20, supportRetentionRatio: 0 };
  if (level === 2) return { frictionCoefficient: 0.80, cargoRetentionRatio: 0.38, supportRetentionRatio: 0 };
  return { frictionCoefficient: 0.88, cargoRetentionRatio: 0.58, supportRetentionRatio: 0 };
}

export function buildSecuringUsage(target: PhysicsTarget, level: SecuringLevel): SecuringUsage {
  const palletCount = target.mode === 'pallets' ? (target.supports?.length ?? 0) : 0;
  const palletWeightKg = target.mode === 'pallets'
    ? (target.supports ?? []).reduce((sum, support) => sum + Math.max(0, support.weightKg), 0)
    : 0;

  let bandingStraps = 0;
  let bandingLengthM = 0;
  let cornerGuards = 0;
  let wrappingLengthM = 0;
  let antiSlipMats = 0;
  let loadBars = 0;

  if (target.mode === 'pallets' && level > 0) {
    const strapsPerPallet = level === 1 ? 2 : level === 2 ? 3 : 4;
    bandingStraps = palletCount * strapsPerPallet;
    bandingLengthM = bandingStraps * 4.5;
    cornerGuards = palletCount * 4;
    antiSlipMats = palletCount * (level === 3 ? 2 : 1);
    wrappingLengthM = level >= 2 ? palletCount * (level === 2 ? 12 : 20) : 0;
    loadBars = level === 3 && palletCount > 0 ? 2 : 0;
  } else if (target.mode === 'boxes' && level > 0) {
    antiSlipMats = Math.max(1, Math.ceil(target.result.placements.length / (level === 1 ? 24 : 16)));
    loadBars = level >= 2 ? 2 : 0;
    bandingStraps = level === 3 ? Math.max(2, Math.ceil(target.result.placements.length / 40) * 2) : 0;
    bandingLengthM = bandingStraps * 5.5;
  }

  // 실제 자재 규격이 입력되기 전까지 결과 비교용 보수적 기본 중량을 사용한다.
  const estimatedAddedWeightKg =
    bandingLengthM * 0.025 +
    cornerGuards * 0.18 +
    wrappingLengthM * 0.018 +
    antiSlipMats * 0.35 +
    loadBars * 4.5;

  return {
    level,
    levelLabel: LEVEL_LABEL[level],
    palletCount,
    palletWeightKg,
    bandingStraps,
    bandingLengthM,
    cornerGuards,
    wrappingLengthM,
    antiSlipMats,
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
          levelLabel: LEVEL_LABEL[level],
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

  window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
  return certification;
}
