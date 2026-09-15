import { packByBlockSpaceBeamV2, type BeamPackingOutput } from './blockSpaceBeamPackerV2';
import { centerPlacementsOnContainer } from './containerCentering';
import { validatePlacements } from './constraints';
import { analyzeFloorLoad } from './floorLoad';
import { packByStrictWalls, type StrictWallOutput, type StrictWallStrategy } from './strictWallPacker';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';

const EPS = 1e-9;
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
    // priority 1 is unloaded first and therefore should be nearer the door-side end.
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
  strategy: StrictWallStrategy,
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

  // Bounds/collision and payload are hard gates. A candidate cannot buy its way out of a
  // physical violation with a better utilization score.
  const hardViolation = result.validationIssues.length > 0 || result.loadedWeightKg > container.maxPayloadKg + EPS;
  let score = Number.NEGATIVE_INFINITY;

  if (!hardViolation) {
    if (strategy === 'capacity') {
      score = fillRatePct * 0.35
        + loadedRatePct * 0.35
        + quality.loadingQualityScore * 0.08
        + quality.stabilityScore * 0.07
        + quality.balanceScore * 0.05
        + floorScore * 0.10;
    } else if (strategy === 'stability') {
      score = fillRatePct * 0.12
        + loadedRatePct * 0.18
        + quality.loadingQualityScore * 0.18
        + quality.stabilityScore * 0.25
        + quality.balanceScore * 0.15
        + floorScore * 0.12;
    } else {
      score = fillRatePct * 0.12
        + loadedRatePct * 0.18
        + quality.loadingQualityScore * 0.15
        + quality.stabilityScore * 0.12
        + quality.balanceScore * 0.10
        + floorScore * 0.08
        + unloadScore * 0.25;
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
    floorDistributionScore: floorScore,
    unloadingScore: unloadScore,
    validationIssueCount: result.validationIssues.length,
    output,
  };
}

/**
 * Deterministic solver portfolio for DIRECT BOX loading.
 *
 * The wall/block beam packer is strong at dense homogeneous walls. EMS Beam V2 is
 * strong at reusing safe residual spaces. Running both gives the strategy scorer two
 * genuinely different plans instead of asking one heuristic to be good at everything.
 */
export function compareHybridCandidates(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: StrictWallStrategy,
): HybridCandidateAssessment[] {
  const candidates: Array<{ engine: HybridPackingEngine; output: PackingOutput }> = [
    { engine: 'strict-wall', output: packByStrictWalls(container, cargo, strategy) },
    { engine: 'ems-beam-v2', output: packByBlockSpaceBeamV2(container, cargo, strategy) },
  ];

  return candidates
    .map(({ engine, output }) => scoreCandidate(container, cargo, strategy, engine, output))
    .sort((a, b) =>
      b.score - a.score
      || b.output.placements.length - a.output.placements.length
      || b.output.usedVolumeM3 - a.output.usedVolumeM3
      || a.engine.localeCompare(b.engine),
    );
}

export function packByHybridOptimizer(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: StrictWallStrategy,
): PackingOutput {
  return compareHybridCandidates(container, cargo, strategy)[0]?.output
    ?? packByStrictWalls(container, cargo, strategy);
}
