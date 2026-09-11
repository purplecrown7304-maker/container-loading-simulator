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

const MODES: ConcreteLoadingStrategy[] = ['capacity', 'balance', 'safety', 'unloading', 'grouping'];
const MIN_TRANSPORT_PHYSICS_SCORE = 85;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

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
 * Auto mode: analyze cargo, adapt the requested 30/20/20/15/10/5 weights, evaluate all
 * concrete strategies, reject hard-safety failures, then compare transport physics.
 */
export async function optimizeLoadingWithPhysics(
  container: ContainerSpec,
  cargo: CargoItem[],
  onProgress?: (progress: PhysicsOptimizationProgress) => void,
): Promise<PhysicsOptimizedLoading> {
  const activeCargo = cargo.filter(item => item.quantity > 0);
  const requested = readUserLoadingStrategy();
  const auto = analyzeCargoForAuto(activeCargo);
  const modes = requestedModes(requested);
  const weights = requested === 'auto' ? auto.weights : weightsForExplicitStrategy(requested);
  const candidates: PhysicsOptimizationCandidate[] = [];
  const scoredByMode = new Map<ConcreteLoadingStrategy, ReturnType<typeof scoreStrategyResult>>();
  const physicsByLayout = new Map<string, PhysicsValidationSuite>();
  const rejected: string[] = [];

  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const strategy = legacyStrategyFor(mode);
    const candidateCargo = modeCargo(activeCargo, mode);
    const base = loadContainer(container, candidateCargo, { strategy, publish: false });
    const result = postProcessMode(container, candidateCargo, mode, base);
    const gate = validateFinalLoadingCandidate(container, candidateCargo, result);
    if (!gate.passed) {
      rejected.push(`${STRATEGY_LABELS[mode]}: ${gate.reasons[0] ?? '안전 게이트 실패'}`);
      onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: 1 });
      continue;
    }

    const signature = placementSignature(result);
    let physics = physicsByLayout.get(signature);
    if (physics) {
      onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: 1 });
    } else {
      physics = await runPhysicsValidationSuite(
        container,
        result.placements,
        value => onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: modes.length, physicsProgress: value }),
      );
      physicsByLayout.set(signature, physics);
    }

    const scored = scoreStrategyResult(container, candidateCargo, result, weights, physics.score);
    scoredByMode.set(mode, scored);
    const groupingScore = scored.componentScores.grouping;
    const utilizationScore = scored.componentScores.utilization;
    const balanceScore = scored.componentScores.balance;
    candidates.push({
      strategy,
      mode,
      score: scored.totalScore,
      physicsScore: physics.score,
      completionScore: completionScore(activeCargo, result),
      balanceScore,
      groupingScore,
      utilizationScore,
      result,
      physics,
    });
  }

  candidates.sort(comparePhysicsOptimizationCandidates);
  let best = candidates[0];

  if (!best) {
    const fallbackMode: ConcreteLoadingStrategy = 'safety';
    const fallbackCargo = modeCargo(activeCargo, fallbackMode);
    const strategy = legacyStrategyFor(fallbackMode);
    const result = loadContainer(container, fallbackCargo, { strategy, publish: false });
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
  };

  publishStrategyDecision(decision);
  setNextStrategyResultOverride(container, activeCargo, best.strategy, best.result);
  return { strategy: best.strategy, mode: best.mode, score: best.score, result: best.result, physics: best.physics, candidates, decision };
}
