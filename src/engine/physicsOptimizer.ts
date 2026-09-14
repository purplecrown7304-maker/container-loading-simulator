import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { runPhysicsValidationSuite, type PhysicsValidationSuite } from './physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import {
  analyzeCargoForAuto,
  cargoForStrategy,
  legacyStrategyFor,
  publishStrategyDecision,
  readUserLoadingStrategy,
  scoreStrategyResult,
  STRATEGY_LABELS,
  weightsForExplicitStrategy,
  type ConcreteLoadingStrategy,
  type StrategyDecision,
  type UserLoadingStrategy,
} from './loadingStrategy';
import { validateFinalLoadingCandidate } from './loadingSafetyGate';
import { reorderForSkuGrouping, reorderForUnloading } from './operationalWallReorder';
import { validatePlacements } from './constraints';
import { setNextStrategyResultOverride } from './strategyResultOverride';

export type PhysicsOptimizationCandidate = {
  strategy: LoadingStrategy;
  mode: ConcreteLoadingStrategy;
  score: number;
  physicsScore: number;
  completionScore: number;
  balanceScore: number;
  groupingScore: number;
  utilizationScore: number;
  result: LoadingResult;
  physics: PhysicsValidationSuite;
};

export type PhysicsOptimizedLoading = {
  strategy: LoadingStrategy;
  mode: ConcreteLoadingStrategy;
  score: number;
  result: LoadingResult;
  physics: PhysicsValidationSuite;
  candidates: PhysicsOptimizationCandidate[];
  decision: StrategyDecision;
};

export type PhysicsOptimizationProgress = {
  strategy: LoadingStrategy;
  candidateIndex: number;
  candidateCount: number;
  physicsProgress: number;
};

export type AutomaticLoadingProgressDetail = {
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  startedAt: number;
  candidateIndex: number;
  candidateCount: number;
};

export const AUTOMATIC_LOADING_PROGRESS_EVENT = 'container-loading:automatic-loading-progress';

const MODES: ConcreteLoadingStrategy[] = ['capacity', 'balance', 'safety', 'unloading', 'grouping'];
const MIN_TRANSPORT_PHYSICS_SCORE = 85;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function publishAutomaticProgress(detail: AutomaticLoadingProgressDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AutomaticLoadingProgressDetail>(AUTOMATIC_LOADING_PROGRESS_EVENT, { detail }));
}

function totalUnstable(physics: PhysicsValidationSuite) {
  return physics.unstableCount + physics.supportUnstableCount;
}

function placementSignature(result: LoadingResult) {
  return result.placements
    .map(p => [p.cargoId, p.x, p.y, p.z, p.length, p.width, p.height, p.weightKg, p.rotated === true ? 1 : 0].join(':'))
    .sort()
    .join('|');
}

function safetyTier(physics: PhysicsValidationSuite) {
  if (totalUnstable(physics) > 0) return 3;
  if (!physics.settled) return 2;
  if (physics.score < MIN_TRANSPORT_PHYSICS_SCORE) return 1;
  return 0;
}

function completionScore(cargo: CargoItem[], result: LoadingResult) {
  const requested = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  return requested > 0 ? clamp(result.placements.length / requested * 100) : 100;
}

function postProcessMode(container: ContainerSpec, cargo: CargoItem[], mode: ConcreteLoadingStrategy, result: LoadingResult): LoadingResult {
  let placements = result.placements;
  if (mode === 'unloading') placements = reorderForUnloading(container, cargo, placements);
  if (mode === 'grouping') placements = reorderForSkuGrouping(container, cargo, placements);
  if (placements === result.placements) return result;
  return { ...result, placements, validationIssues: validatePlacements(container, placements) };
}

function modeCargo(cargo: CargoItem[], mode: ConcreteLoadingStrategy) {
  return cargoForStrategy(cargo, mode);
}

function requestedModes(requested: UserLoadingStrategy) {
  return requested === 'auto' ? MODES : [requested];
}

export function comparePhysicsOptimizationCandidates(a: PhysicsOptimizationCandidate, b: PhysicsOptimizationCandidate) {
  const tierDiff = safetyTier(a.physics) - safetyTier(b.physics);
  if (tierDiff !== 0) return tierDiff;
  const unstableDiff = totalUnstable(a.physics) - totalUnstable(b.physics);
  if (unstableDiff !== 0) return unstableDiff;
  if (a.score !== b.score) return b.score - a.score;
  if (a.physicsScore !== b.physicsScore) return b.physicsScore - a.physicsScore;
  if (a.completionScore !== b.completionScore) return b.completionScore - a.completionScore;
  return b.result.placements.length - a.result.placements.length;
}

/**
 * Explicit mode: evaluate only the strategy selected by the user.
 * Auto mode: analyze cargo, adapt the requested weights, evaluate all concrete strategies,
 * reject hard-safety failures, then compare transport physics.
 */
export async function optimizeLoadingWithPhysics(
  container: ContainerSpec,
  cargo: CargoItem[],
  onProgress?: (progress: PhysicsOptimizationProgress) => void,
): Promise<PhysicsOptimizedLoading> {
  const startedAt = Date.now();
  const activeCargo = cargo.filter(item => item.quantity > 0);
  const requested = readUserLoadingStrategy();
  const auto = analyzeCargoForAuto(activeCargo);
  const modes = requestedModes(requested);
  const weights = requested === 'auto' ? auto.weights : weightsForExplicitStrategy(requested);
  const candidates: PhysicsOptimizationCandidate[] = [];
  const scoredByMode = new Map<ConcreteLoadingStrategy, ReturnType<typeof scoreStrategyResult>>();
  const physicsByLayout = new Map<string, PhysicsValidationSuite>();
  const rejected: string[] = [];
  const emit = (candidateIndex: number, physicsProgress: number, stage: string, status: AutomaticLoadingProgressDetail['status'] = 'running') => {
    const candidateFraction = modes.length > 0 ? ((Math.max(1, candidateIndex) - 1) + Math.max(0, Math.min(1, physicsProgress))) / modes.length : 0;
    const progress = status === 'done' ? 1 : Math.min(.96, candidateFraction * .96);
    publishAutomaticProgress({ status, progress, stage, startedAt, candidateIndex, candidateCount: modes.length });
  };

  emit(1, 0, '화물 조건 분석 및 적재 후보 준비 중');

  try {
    for (let index = 0; index < modes.length; index += 1) {
      const mode = modes[index];
      const strategy = legacyStrategyFor(mode);
      const candidateCargo = modeCargo(activeCargo, mode);
      emit(index + 1, 0, `${STRATEGY_LABELS[mode]} · 적재 위치 후보 계산 중`);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const base = loadContainer(container, candidateCargo, { strategy, publish: false });
      const result = postProcessMode(container, candidateCargo, mode, base);
      const gate = validateFinalLoadingCandidate(container, candidateCargo, result);
      if (!gate.passed) {
        rejected.push(`${STRATEGY_LABELS[mode]}: ${gate.reasons[0] ?? '안전 게이트 실패'}`);
        onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: 1 });
        emit(index + 1, 1, `${STRATEGY_LABELS[mode]} · 안전 조건 확인 완료`);
        continue;
      }

      const signature = placementSignature(result);
      let physics = physicsByLayout.get(signature);
      if (physics) {
        onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: 1 });
        emit(index + 1, 1, `${STRATEGY_LABELS[mode]} · 기존 물리 검증 결과 재사용`);
      } else {
        physics = await runPhysicsValidationSuite(
          container,
          result.placements,
          value => {
            onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: value });
            emit(index + 1, value, `${STRATEGY_LABELS[mode]} · 무게 중심 및 물리 안정성 검증 중`);
          },
        );
        physicsByLayout.set(signature, physics);
      }

      const scored = scoreStrategyResult(container, candidateCargo, result, weights, physics.score);
      scoredByMode.set(mode, scored);
      candidates.push({
        strategy,
        mode,
        score: scored.totalScore,
        physicsScore: physics.score,
        completionScore: completionScore(activeCargo, result),
        balanceScore: scored.componentScores.balance,
        groupingScore: scored.componentScores.grouping,
        utilizationScore: scored.componentScores.utilization,
        result,
        physics,
      });
    }

    emit(modes.length, 1, '후보별 종합 점수 비교 및 최종 적재 위치 검증 중');
    candidates.sort(comparePhysicsOptimizationCandidates);
    let best = candidates[0];

    if (!best) {
      const fallbackMode: ConcreteLoadingStrategy = 'safety';
      const fallbackCargo = modeCargo(activeCargo, fallbackMode);
      const strategy = legacyStrategyFor(fallbackMode);
      const result = loadContainer(container, fallbackCargo, { strategy, publish: false });
      const fallbackGate = validateFinalLoadingCandidate(container, fallbackCargo, result);

      if (!fallbackGate.passed) {
        const safeEmpty: LoadingResult = {
          placements: [],
          remaining: activeCargo.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: `안전 검사 실패: ${fallbackGate.reasons[0] ?? rejected[0] ?? '안전한 적재 위치를 찾지 못함'}` })),
          loadedWeightKg: 0,
          usedVolumeM3: 0,
          validationIssues: [],
          autoCorrections: [],
        };
        setNextStrategyResultOverride(container, activeCargo, 'stability', safeEmpty);
        throw new Error(`모든 자동적재 후보가 안전 검사에서 탈락했습니다. ${fallbackGate.reasons[0] ?? rejected[0] ?? ''}`.trim());
      }

      emit(modes.length, 1, '안전성 우선 대체 적재안 물리 검증 중');
      const physics = await runPhysicsValidationSuite(container, result.placements);
      const scored = scoreStrategyResult(container, fallbackCargo, result, weightsForExplicitStrategy(fallbackMode), physics.score);
      best = {
        strategy,
        mode: fallbackMode,
        score: scored.totalScore,
        physicsScore: physics.score,
        completionScore: completionScore(activeCargo, result),
        balanceScore: scored.componentScores.balance,
        groupingScore: scored.componentScores.grouping,
        utilizationScore: scored.componentScores.utilization,
        result,
        physics,
      };
      scoredByMode.set(fallbackMode, scored);
    }

    const scored = scoredByMode.get(best.mode) ?? scoreStrategyResult(container, activeCargo, best.result, weights, best.physics.score);
    const reasons = requested === 'auto'
      ? [...auto.reasons, `종합 평가에서 ${STRATEGY_LABELS[best.mode]} 전략이 가장 높은 안전·운영 점수를 얻었습니다.`, ...rejected.slice(0, 2)]
      : [`사용자가 ${STRATEGY_LABELS[requested]} 전략을 직접 선택했습니다.`, ...rejected.slice(0, 2)];
    const decision: StrategyDecision = {
      requestedStrategy: requested,
      selectedStrategy: best.mode,
      weights,
      reasons,
      componentScores: scored.componentScores,
      totalScore: best.score,
      axleLoads: scored.axleLoads ? {
        frontKg: scored.axleLoads.frontKg,
        rearKg: scored.axleLoads.rearKg,
        frontRatePct: scored.axleLoads.frontRatePct,
        rearRatePct: scored.axleLoads.rearRatePct,
      } : undefined,
    };

    publishStrategyDecision(decision);
    setNextStrategyResultOverride(container, activeCargo, best.strategy, best.result);
    emit(modes.length, 1, '최종 적재 위치 확정 완료', 'done');
    return { strategy: best.strategy, mode: best.mode, score: best.score, result: best.result, physics: best.physics, candidates, decision };
  } catch (error) {
    publishAutomaticProgress({ status: 'error', progress: 0, stage: '자동 적재 계산 중 오류가 발생했습니다.', startedAt, candidateIndex: 0, candidateCount: modes.length });
    throw error;
  }
}
