import { packByBlockSpaceBeamV2, type BeamPackingOutput } from './blockSpaceBeamPackerV2';
import { centerPlacementsOnContainer } from './containerCentering';
import { auditLoading } from './loadingAudit';
import { analyzeFloorLoad } from './floorLoad';
import { packByStrictWalls, type StrictWallOutput, type StrictWallStrategy } from './strictWallPacker';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';
import { fitsEmptyContainer, loadingHeightProfiles, operationalQuality, unloadingObstructions } from './operationalQuality';

const EPS = 1e-9;
const LARGE_COMPLETED_JOB_COUNT = 120;
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

function toCenteredResult(container: ContainerSpec, cargo: CargoItem[], output: PackingOutput): LoadingResult {
  const placements = centerPlacementsOnContainer(container, output.placements);
  return {
    placements,
    remaining: output.remaining,
    loadedWeightKg: output.loadedWeightKg,
    usedVolumeM3: output.usedVolumeM3,
    validationIssues: auditLoading(container, cargo, placements),
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
  strategy: StrictWallStrategy,
  engine: HybridPackingEngine,
  output: PackingOutput,
): HybridCandidateAssessment {
  const result = toCenteredResult(container, cargo, output);
  const requestedCount = Math.max(1, cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0));
  const containerVolume = Math.max(EPS, container.length * container.width * container.height);
  const fillRatePct = clamp100(result.usedVolumeM3 / containerVolume * 100);
  const loadedRatePct = clamp100(result.placements.length / requestedCount * 100);
  const quality = assessWeightBalance(container, result);
  const floorScore = floorDistributionScore(container, result);
  const unloadScore = unloadingArrangementScore(container, cargo, result);
  const shape = operationalQuality(container, result.placements);

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

  if (Number.isFinite(score)) {
    score -= shape.slenderness * 45;
    score -= shape.cogHeight / container.height * (strategy === 'stability' ? 55 : 18);
    if (strategy === 'capacity') score -= shape.footprint * 6;
    if (strategy === 'unloading') score -= unloadingObstructions(cargo, result.placements) / Math.max(1, result.placements.length) * 150;
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

function rankCandidates(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: StrictWallStrategy,
  candidates: Array<{ engine: HybridPackingEngine; output: PackingOutput }>,
) {
  return candidates
    .map(({ engine, output }) => scoreCandidate(container, cargo, strategy, engine, output))
    .sort((a, b) => {
      if (Number.isFinite(a.score) !== Number.isFinite(b.score)) return Number.isFinite(a.score) ? -1 : 1;
      // Never discard safely loadable demand just to obtain a cosmetically better balance score.
      const completionDiff = b.output.placements.length - a.output.placements.length;
      if (completionDiff) return completionDiff;
      const scoreDiff = b.score - a.score;
      if (Number.isFinite(scoreDiff) && Math.abs(scoreDiff) > EPS) return scoreDiff;
      return b.output.placements.length - a.output.placements.length
        || b.output.usedVolumeM3 - a.output.usedVolumeM3
        || a.engine.localeCompare(b.engine);
    });
}

/**
 * Deterministic solver portfolio for DIRECT BOX loading.
 *
 * StrictWall is strong at dense homogeneous walls. EMS Beam V2 is strong at safe residual
 * space reuse. The portfolio lets both compete on the same strategy score instead of
 * asking one heuristic to be good at every cargo shape.
 */
export function compareHybridCandidates(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: StrictWallStrategy,
): HybridCandidateAssessment[] {
  return rankCandidates(container, cargo, strategy, [
    { engine: 'strict-wall', output: packByStrictWalls(container, cargo, strategy) },
    { engine: 'ems-beam-v2', output: packByBlockSpaceBeamV2(container, cargo, strategy) },
  ]);
}

export function packByHybridOptimizer(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: StrictWallStrategy,
): PackingOutput {
  // Impossible units must not hold the latest unloading stop open forever or
  // trigger a costly residual search for a large otherwise-complete shipment.
  const eligible = cargo.filter(item => fitsEmptyContainer(container, item));
  if (eligible.length !== cargo.length) {
    const packed: PackingOutput = eligible.length ? packByHybridOptimizer(container, eligible, strategy)
      : { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0 };
    return { ...packed, remaining: [...packed.remaining, ...cargo.filter(item => !fitsEmptyContainer(container, item)).map(item => ({
      cargoId: item.id, quantity: item.quantity, reason: '허용 회전 규격 또는 단품 중량이 적재공간 한도를 초과함',
    }))] };
  }
  const strict = packByStrictWalls(container, cargo, strategy);
  const requestedCount = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const strictRemaining = strict.remaining.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);

  // For a large, complete plan, compare the low-height portfolio below. Re-running
  // an expensive full-height EMS search cannot add any demand and blocks completion.
  const candidates: Array<{ engine: HybridPackingEngine; output: PackingOutput }> = [{ engine: 'strict-wall', output: strict }];
  const complete = strictRemaining === 0 && auditLoading(container, cargo, strict.placements).length === 0;
  if (!(requestedCount >= LARGE_COMPLETED_JOB_COUNT && complete)) {
    candidates.push({ engine: 'ems-beam-v2', output: packByBlockSpaceBeamV2(container, cargo, strategy) });
  }
  // Low, broad alternatives must survive before scoring; a score cannot recover a
  // floor layout that the full-height block search already pruned.
  for (const height of loadingHeightProfiles(container, cargo)) {
    candidates.push({ engine: 'strict-wall', output: packByStrictWalls({ ...container, height }, cargo, strategy) });
  }
  return rankCandidates(container, cargo, strategy, candidates).find(candidate => Number.isFinite(candidate.score))?.output ?? {
    placements: [], loadedWeightKg: 0, usedVolumeM3: 0,
    remaining: cargo.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: '적재 규칙 재검사 실패: 안전한 배치를 찾지 못했습니다.' })),
  };
}
