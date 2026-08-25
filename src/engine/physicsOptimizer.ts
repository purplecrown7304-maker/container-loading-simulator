import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { runPhysicsValidationSuite, type PhysicsValidationSuite } from './physicsValidation';
import { assessShapeQuality } from './shapeQuality';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';

export type PhysicsOptimizationCandidate = {
  strategy: LoadingStrategy;
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
  score: number;
  result: LoadingResult;
  physics: PhysicsValidationSuite;
  candidates: PhysicsOptimizationCandidate[];
};

export type PhysicsOptimizationProgress = {
  strategy: LoadingStrategy;
  candidateIndex: number;
  candidateCount: number;
  physicsProgress: number;
};

const STRATEGIES: LoadingStrategy[] = ['stability', 'capacity', 'unloading'];
const MIN_TRANSPORT_PHYSICS_SCORE = 85;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function totalUnstable(physics: PhysicsValidationSuite) {
  return physics.unstableCount + physics.supportUnstableCount;
}

/**
 * 안전 등급은 적재율/그룹핑 같은 운영 효율보다 항상 먼저 비교한다.
 * 0: 운송 안전 목표 충족
 * 1: 붕괴는 없지만 점수 목표 미달
 * 2: 종료 시 잔류 움직임 존재
 * 3: 실제 불안정 위치 존재
 */
function safetyTier(physics: PhysicsValidationSuite) {
  if (totalUnstable(physics) > 0) return 3;
  if (!physics.settled) return 2;
  if (physics.score < MIN_TRANSPORT_PHYSICS_SCORE) return 1;
  return 0;
}

function scoreCandidate(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, physics: PhysicsValidationSuite) {
  const requestedCount = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const completionScore = requestedCount > 0 ? clamp(result.placements.length / requestedCount * 100) : 100;
  const balanceScore = assessWeightBalance(container, result).balanceScore;
  const grouping = assessShapeQuality(container, result.placements);
  const groupingScore = clamp(100 - grouping.fragmentedCargoTypes * 18);
  const containerVolume = Math.max(0.001, container.length * container.width * container.height);
  const utilizationScore = clamp(result.usedVolumeM3 / containerVolume * 100);
  const geometryPenalty = result.validationIssues.length * 35;
  const unstablePenalty = totalUnstable(physics) * 18;
  const movingPenalty = physics.settled ? 0 : 12;

  // 이 점수는 같은 안전 등급 안에서 운영 효율을 비교하는 보조 점수다.
  // 최종 후보 선택 자체는 아래 compareCandidates에서 물리 안전을 먼저 본다.
  const score = clamp(
    physics.score * 0.75 +
    completionScore * 0.10 +
    balanceScore * 0.06 +
    groupingScore * 0.05 +
    utilizationScore * 0.04 -
    geometryPenalty -
    unstablePenalty -
    movingPenalty,
  );
  return { score, completionScore, balanceScore, groupingScore, utilizationScore };
}

export function comparePhysicsOptimizationCandidates(a: PhysicsOptimizationCandidate, b: PhysicsOptimizationCandidate) {
  const tierDiff = safetyTier(a.physics) - safetyTier(b.physics);
  if (tierDiff !== 0) return tierDiff;

  const unstableDiff = totalUnstable(a.physics) - totalUnstable(b.physics);
  if (unstableDiff !== 0) return unstableDiff;

  // 같은 안전 등급이면 물리점수가 최우선이다. 따라서 적재율이 높다는 이유로
  // 더 낮은 물리점수 후보가 선택되는 일이 없다.
  if (a.physicsScore !== b.physicsScore) return b.physicsScore - a.physicsScore;
  if (a.completionScore !== b.completionScore) return b.completionScore - a.completionScore;
  if (a.score !== b.score) return b.score - a.score;
  if (a.balanceScore !== b.balanceScore) return b.balanceScore - a.balanceScore;
  return b.result.placements.length - a.result.placements.length;
}

/**
 * 후보 적재안을 여러 개 만든 뒤 Rapier 3D 운송 시나리오로 실제 움직임을 비교한다.
 * 휴리스틱 규칙은 후보 생성과 운영 효율에만 쓰고, 최종 안전 우선순위는 물리 점수가 결정한다.
 */
export async function optimizeLoadingWithPhysics(
  container: ContainerSpec,
  cargo: CargoItem[],
  onProgress?: (progress: PhysicsOptimizationProgress) => void,
): Promise<PhysicsOptimizedLoading> {
  const activeCargo = cargo.filter(item => item.quantity > 0);
  const candidates: PhysicsOptimizationCandidate[] = [];

  for (let index = 0; index < STRATEGIES.length; index += 1) {
    const strategy = STRATEGIES[index];
    const result = loadContainer(container, activeCargo, { strategy, publish: false });
    const physics = await runPhysicsValidationSuite(
      container,
      result.placements,
      value => onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: STRATEGIES.length, physicsProgress: value }),
    );
    const scored = scoreCandidate(container, activeCargo, result, physics);
    candidates.push({
      strategy,
      score: scored.score,
      physicsScore: physics.score,
      completionScore: scored.completionScore,
      balanceScore: scored.balanceScore,
      groupingScore: scored.groupingScore,
      utilizationScore: scored.utilizationScore,
      result,
      physics,
    });
  }

  candidates.sort(comparePhysicsOptimizationCandidates);

  const best = candidates[0];
  if (!best) {
    const result = loadContainer(container, activeCargo, { strategy: 'stability', publish: false });
    const physics = await runPhysicsValidationSuite(container, result.placements);
    return { strategy: 'stability', score: physics.score, result, physics, candidates: [] };
  }

  return { strategy: best.strategy, score: best.score, result: best.result, physics: best.physics, candidates };
}
