import { packByBlockSpaceBeamV2, type BeamPackingOutput } from './blockSpaceBeamPackerV2';
import { centerPlacementsOnContainer } from './containerCentering';
import { validatePlacements } from './constraints';
import { analyzeFloorLoad } from './floorLoad';
import { basePackingStrategy, type LoadingStrategy } from './loadingStrategies';
import { packByStrictWalls, type StrictWallOutput } from './strictWallPacker';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';

const EPS = 1e-9;
const CAPACITY_FAST_PATH_COUNT = 120;
const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

type PackingOutput = StrictWallOutput | BeamPackingOutput;
export type HybridPackingEngine = 'strict-wall' | 'ems-beam-v2';

export type HybridCandidateAssessment = {
  engine: HybridPackingEngine;
  score: number;
  fillRatePct: number;
  loadedRatePct: number;
  qualityScore: number;
  stabilityScore: number;
  balanceScore: number;
  lowCenterOfGravityScore: number;
  floorDistributionScore: number;
  unloadingScore: number;
  validationIssueCount: number;
  output: PackingOutput;
};

function toCenteredResult(container: ContainerSpec, output: PackingOutput): LoadingResult {
  const placements = centerPlacementsOnContainer(container, output.placements);
  return {
    placements,
    remaining: output.remaining,
    loadedWeightKg: output.loadedWeightKg,
    usedVolumeM3: output.usedVolumeM3,
    validationIssues: validatePlacements(container, placements),
    autoCorrections: [],
  };
}

function unloadingArrangementScore(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const configured = cargo.filter((item) => Number.isFinite(item.unloadPriority) && (item.unloadPriority ?? 0) > 0);
  if (configured.length < 2) return 50;

  const priorities = configured.map((item) => item.unloadPriority as number);
  const min = Math.min(...priorities);
  const max = Math.max(...priorities);
  if (max <= min) return 50;

  const xByCargo = new Map<string, number[]>();
  for (const placement of result.placements) {
    const xs = xByCargo.get(placement.cargoId) ?? [];
    xs.push((placement.x + placement.length / 2) / Math.max(EPS, container.length));
    xByCargo.set(placement.cargoId, xs);
  }

  let weighted = 0;
  let count = 0;
  for (const item of configured) {
    const xs = xByCargo.get(item.id);
    if (!xs?.length) continue;
    const actual = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const normalizedPriority = ((item.unloadPriority as number) - min) / (max - min);
    const target = 1 - normalizedPriority;
    const score = clamp100(100 - Math.abs(actual - target) * 120);
    weighted += score * xs.length;
    count += xs.length;
  }
  return count > 0 ? weighted / count : 50;
}

function floorDistributionScore(container: ContainerSpec, result: LoadingResult) {
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const average = Math.max(1, floor.averageKgPerM2);
  const peakRatio = floor.maxKgPerM2 / average;
  return clamp100(100 - Math.max(0, peakRatio - 1) * 18);
}

function scoreCandidate(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
  engine: HybridPackingEngine,
  output: PackingOutput,
): HybridCandidateAssessment {
  const result = toCenteredResult(container, output);
  const requestedCount = Math.max(1, cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0));
  const containerVolume = Math.max(EPS, container.length * container.width * container.height);
  const fillRatePct = clamp100(result.usedVolumeM3 / containerVolume * 100);
  const loadedRatePct = clamp100(result.placements.length / requestedCount * 100);
  const quality = assessWeightBalance(container, result);
  const floorScore = floorDistributionScore(container, result);
  const unloadScore = unloadingArrangementScore(container, cargo, result);
  const lowCogScore = clamp100(100 - Math.max(0, quality.verticalCenterPct - 20) * 1.5);

  // PR #50 safety gate is intentionally preserved. No objective can compensate for a
  // geometry/payload violation, regardless of utilization or strategy preference.
  const hardViolation = result.validationIssues.length > 0 || result.loadedWeightKg > container.maxPayloadKg + EPS;
  let score = Number.NEGATIVE_INFINITY;

  if (!hardViolation) {
    switch (strategy) {
      case 'capacity':
        score = fillRatePct * 0.35
          + loadedRatePct * 0.35
          + quality.loadingQualityScore * 0.08
          + quality.stabilityScore * 0.07
          + quality.balanceScore * 0.05
          + floorScore * 0.10;
        break;
      case 'stability':
        score = fillRatePct * 0.12
          + loadedRatePct * 0.18
          + quality.loadingQualityScore * 0.18
          + quality.stabilityScore * 0.25
          + quality.balanceScore * 0.15
          + floorScore * 0.07
          + lowCogScore * 0.05;
        break;
      case 'center-of-gravity':
        score = fillRatePct * 0.08
          + loadedRatePct * 0.14
          + quality.loadingQualityScore * 0.10
          + quality.stabilityScore * 0.17
          + quality.balanceScore * 0.24
          + floorScore * 0.07
          + lowCogScore * 0.20;
        break;
      case 'floor-balance':
        score = fillRatePct * 0.10
          + loadedRatePct * 0.15
          + quality.loadingQualityScore * 0.10
          + quality.stabilityScore * 0.14
          + quality.balanceScore * 0.16
          + floorScore * 0.30
          + lowCogScore * 0.05;
        break;
      case 'unloading':
        score = fillRatePct * 0.12
          + loadedRatePct * 0.18
          + quality.loadingQualityScore * 0.15
          + quality.stabilityScore * 0.12
          + quality.balanceScore * 0.10
          + floorScore * 0.08
          + unloadScore * 0.25;
        break;
      case 'balanced':
      default:
        score = fillRatePct * 0.18
          + loadedRatePct * 0.20
          + quality.loadingQualityScore * 0.15
          + quality.stabilityScore * 0.15
          + quality.balanceScore * 0.10
          + floorScore * 0.10
          + unloadScore * 0.07
          + lowCogScore * 0.05;
        break;
    }
  }

  return {
    engine,
    score,
    fillRatePct,
    loadedRatePct,
    qualityScore: quality.loadingQualityScore,
    stabilityScore: quality.stabilityScore,
    balanceScore: quality.balanceScore,
    lowCenterOfGravityScore: lowCogScore,
    floorDistributionScore: floorScore,
    unloadingScore: unloadScore,
    validationIssueCount: result.validationIssues.length,
    output,
  };
}

function rankCandidates(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
  candidates: Array<{ engine: HybridPackingEngine; output: PackingOutput }>,
) {
  return candidates
    .map(({ engine, output }) => scoreCandidate(container, cargo, strategy, engine, output))
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Number.isFinite(scoreDiff) && Math.abs(scoreDiff) > EPS) return scoreDiff;
      return b.output.placements.length - a.output.placements.length
        || b.output.usedVolumeM3 - a.output.usedVolumeM3
        || a.engine.localeCompare(b.engine);
    });
}

/**
 * Deterministic solver portfolio introduced by PR #50.
 * StrictWall remains strong at dense homogeneous walls; EMS Beam V2 remains strong at
 * safe residual-space reuse. Six strategies only change preference weights, never hard
 * safety constraints or the two-engine portfolio itself.
 */
export function compareHybridCandidates(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
): HybridCandidateAssessment[] {
  const base = basePackingStrategy(strategy);
  return rankCandidates(container, cargo, strategy, [
    { engine: 'strict-wall', output: packByStrictWalls(container, cargo, base) },
    { engine: 'ems-beam-v2', output: packByBlockSpaceBeamV2(container, cargo, base) },
  ]);
}

export function packByHybridOptimizer(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
): PackingOutput {
  const base = basePackingStrategy(strategy);
  const strict = packByStrictWalls(container, cargo, base);
  const requestedCount = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const strictRemaining = strict.remaining.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);

  // Keep the PR #50 capacity fast path for large, already-complete jobs. Every other
  // strategy compares both solvers because balance/CoG/floor/unloading can still improve.
  if (strategy === 'capacity' && requestedCount >= CAPACITY_FAST_PATH_COUNT && strictRemaining === 0) {
    return strict;
  }

  const beam = packByBlockSpaceBeamV2(container, cargo, base);
  return rankCandidates(container, cargo, strategy, [
    { engine: 'strict-wall', output: strict },
    { engine: 'ems-beam-v2', output: beam },
  ])[0]?.output ?? strict;
}
