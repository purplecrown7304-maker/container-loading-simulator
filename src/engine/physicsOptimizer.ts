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
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function scoreCandidate(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, physics: PhysicsValidationSuite) {
  const requestedCount = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const completionScore = requestedCount > 0 ? clamp(result.placements.length / requestedCount * 100) : 100;
  const balanceScore = assessWeightBalance(container, result).balanceScore;
  const grouping = assessShapeQuality(container, result.placements);
  const groupingScore = clamp(100 - grouping.fragmentedCargoTypes * 18);
  const containerVolume = Math.max(0.001, container.length * container.width * container.height);
  const utilizationScore = clamp(result.usedVolumeM3 / containerVolume * 100);
  const geometryPenalty = result.validationIssues.length * 35;
  const unstablePenalty = physics.unstableCount * 10 + physics.supportUnstableCount * 12;
  const movingPenalty = physics.settled ? 0 : 8;
  const score = clamp(
    physics.score * 0.60 +
    completionScore * 0.20 +
    balanceScore * 0.08 +
    groupingScore * 0.07 +
    utilizationScore * 0.05 -
    geometryPenalty -
    unstablePenalty -
    movingPenalty,
  );
  return { score, completionScore, balanceScore, groupingScore, utilizationScore };
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

  candidates.sort((a, b) =>
    b.score - a.score ||
    b.physicsScore - a.physicsScore ||
    b.result.placements.length - a.result.placements.length ||
    b.balanceScore - a.balanceScore,
  );

  const best = candidates[0];
  if (!best) {
    const result = loadContainer(container, activeCargo, { strategy: 'stability', publish: false });
    const physics = await runPhysicsValidationSuite(container, result.placements);
    return { strategy: 'stability', score: physics.score, result, physics, candidates: [] };
  }

  return { strategy: best.strategy, score: best.score, result: best.result, physics: best.physics, candidates };
}
