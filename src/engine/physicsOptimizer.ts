import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { LOADING_STRATEGIES } from './loadingStrategies';
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

const ALL_STRATEGIES: LoadingStrategy[] = LOADING_STRATEGIES.map((item) => item.id);
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
 * Safety tier always outranks operational efficiency.
 * 0: transport target satisfied
 * 1: no collapse but target score missed
 * 2: residual motion at the end of simulation
 * 3: unstable cargo/support detected
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

  if (a.physicsScore !== b.physicsScore) return b.physicsScore - a.physicsScore;
  if (a.completionScore !== b.completionScore) return b.completionScore - a.completionScore;
  if (a.score !== b.score) return b.score - a.score;
  if (a.balanceScore !== b.balanceScore) return b.balanceScore - a.balanceScore;
  return b.result.placements.length - a.result.placements.length;
}

/**
 * Generates hybrid layouts and validates their actual motion with Rapier. When the user
 * has explicitly selected one of the six strategies, only that strategy is executed;
 * otherwise all six are available for comparison. Identical layouts reuse physics output.
 */
export async function optimizeLoadingWithPhysics(
  container: ContainerSpec,
  cargo: CargoItem[],
  onProgress?: (progress: PhysicsOptimizationProgress) => void,
  preferredStrategy?: LoadingStrategy,
): Promise<PhysicsOptimizedLoading> {
  const activeCargo = cargo.filter(item => item.quantity > 0);
  const candidates: PhysicsOptimizationCandidate[] = [];
  const physicsByLayout = new Map<string, PhysicsValidationSuite>();
  const strategies = preferredStrategy ? [preferredStrategy] : ALL_STRATEGIES;

  for (let index = 0; index < strategies.length; index += 1) {
    const strategy = strategies[index];
    const result = loadContainer(container, activeCargo, { strategy, publish: false });
    const signature = placementSignature(result);
    let physics = physicsByLayout.get(signature);

    if (physics) {
      onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: strategies.length, physicsProgress: 1 });
    } else {
      physics = await runPhysicsValidationSuite(
        container,
        result.placements,
        value => onProgress?.({ strategy, candidateIndex: index + 1, candidateCount: strategies.length, physicsProgress: value }),
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
    const strategy = preferredStrategy ?? 'balanced';
    const result = loadContainer(container, activeCargo, { strategy, publish: false });
    const physics = await runPhysicsValidationSuite(container, result.placements);
    return { strategy, score: physics.score, result, physics, candidates: [] };
  }

  return { strategy: best.strategy, score: best.score, result: best.result, physics: best.physics, candidates };
}
