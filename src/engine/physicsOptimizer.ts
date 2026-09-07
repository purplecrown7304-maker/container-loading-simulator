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

const STRATEGIES: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];
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

/**
 * 물리/무게중심 평가는 적재량을 줄이는 차단 조건이 아니다.
 * 경계·충돌 등 하드 검증 오류가 없는 후보끼리는 적재 완료율을 먼저 비교하고,
 * 같은 적재량 안에서만 관성 안정성·무게중심·그룹핑을 비교한다.
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
  const unstablePenalty = totalUnstable(physics) * 8;
  const movingPenalty = physics.settled ? 0 : 6;

  const score = clamp(
    completionScore * 0.60 +
    utilizationScore * 0.15 +
    physics.score * 0.15 +
    balanceScore * 0.05 +
    groupingScore * 0.05 -
    geometryPenalty -
    unstablePenalty -
    movingPenalty,
  );
  return { score, completionScore, balanceScore, groupingScore, utilizationScore };
}

export function comparePhysicsOptimizationCandidates(a: PhysicsOptimizationCandidate, b: PhysicsOptimizationCandidate) {
  const validationDiff = a.result.validationIssues.length - b.result.validationIssues.length;
  if (validationDiff !== 0) return validationDiff;

  if (a.completionScore !== b.completionScore) return b.completionScore - a.completionScore;
  if (a.result.placements.length !== b.result.placements.length) return b.result.placements.length - a.result.placements.length;
  if (a.utilizationScore !== b.utilizationScore) return b.utilizationScore - a.utilizationScore;

  const tierDiff = safetyTier(a.physics) - safetyTier(b.physics);
  if (tierDiff !== 0) return tierDiff;

  const unstableDiff = totalUnstable(a.physics) - totalUnstable(b.physics);
  if (unstableDiff !== 0) return unstableDiff;

  if (a.physicsScore !== b.physicsScore) return b.physicsScore - a.physicsScore;
  if (a.score !== b.score) return b.score - a.score;
  if (a.balanceScore !== b.balanceScore) return b.balanceScore - a.balanceScore;
  return b.groupingScore - a.groupingScore;
}

/**
 * 후보 적재안을 여러 개 만든 뒤 Rapier 3D 운송 시나리오로 실제 움직임을 비교한다.
 * 동일한 placement 좌표가 전략 이름만 다르게 생성된 경우에는 물리 결과를 재사용한다.
 * 최종 선택에서는 적재 완료율이 최우선이며 무게중심/관성은 경고 및 동률 후보 품질 비교에 사용한다.
 */
export async function optimizeLoadingWithPhysics(
  container: ContainerSpec,
  cargo: CargoItem[],
  onProgress?: (progress: PhysicsOptimizationProgress) => void,
): Promise<PhysicsOptimizedLoading> {
  const activeCargo = cargo.filter(item => item.quantity > 0);
  const candidates: PhysicsOptimizationCandidate[] = [];
  const physicsByLayout = new Map<string, PhysicsValidationSuite>();

  for (let index = 0; index < STRATEGIES.length; index += 1) {
    const strategy = STRATEGIES[index];
    const result = loadContainer(container, activeCargo, { strategy, publish: false });
    const signature = placementSignature(result);
    let physics = physicsByLayout.get(signature);

    if (physics) {
      onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: STRATEGIES.length, physicsProgress: 1 });
    } else {
      physics = await runPhysicsValidationSuite(
        container,
        result.placements,
        value => onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: STRATEGIES.length, physicsProgress: value }),
      );
      physicsByLayout.set(signature, physics);
    }

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
    const result = loadContainer(container, activeCargo, { strategy: 'capacity', publish: false });
    const physics = await runPhysicsValidationSuite(container, result.placements);
    return { strategy: 'capacity', score: physics.score, result, physics, candidates: [] };
  }

  return { strategy: best.strategy, score: best.score, result: best.result, physics: best.physics, candidates };
}
