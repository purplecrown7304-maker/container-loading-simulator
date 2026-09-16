import { analyzeFloorLoad } from './floorLoad';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { LOADING_STRATEGIES, loadingStrategyDefinition } from './loadingStrategies';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';

export type StrategyComparison = {
  strategy: LoadingStrategy;
  label: string;
  description: string;
  result: LoadingResult;
  fillRatePct: number;
  loadedRatePct: number;
  qualityScore: number;
  stabilityScore: number;
  balanceScore: number;
  unloadingScore: number;
  unloadingConfigured: boolean;
  maxFloorLoadKgPerM2: number;
  floorDistributionScore: number;
  overallScore: number;
  remainingCount: number;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function unloadingScore(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const configured = cargo.filter(item => Number.isFinite(item.unloadPriority) && (item.unloadPriority ?? 0) > 0);
  if (configured.length < 2) return { score: 50, configured: false };
  const priorities = configured.map(item => item.unloadPriority as number);
  const min = Math.min(...priorities);
  const max = Math.max(...priorities);
  if (max <= min) return { score: 50, configured: false };

  const byCargo = new Map<string, number[]>();
  result.placements.forEach(p => {
    const xs = byCargo.get(p.cargoId) ?? [];
    xs.push(p.x + p.length / 2);
    byCargo.set(p.cargoId, xs);
  });

  let weightedScore = 0;
  let weight = 0;
  configured.forEach(item => {
    const xs = byCargo.get(item.id);
    if (!xs?.length) return;
    const actual = xs.reduce((a, b) => a + b, 0) / xs.length / Math.max(container.length, 1e-9);
    const normalizedPriority = ((item.unloadPriority as number) - min) / (max - min);
    const target = 1 - normalizedPriority;
    const itemScore = clamp(100 - Math.abs(actual - target) * 120);
    weightedScore += itemScore * xs.length;
    weight += xs.length;
  });
  return { score: weight > 0 ? weightedScore / weight : 50, configured: weight > 0 };
}

export function compareLoadingStrategies(container: ContainerSpec, cargo: CargoItem[]): StrategyComparison[] {
  const totalVolume = Math.max(container.length * container.width * container.height, 1e-9);
  const requestedCount = Math.max(1, cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0));
  const strategies: LoadingStrategy[] = LOADING_STRATEGIES.map((item) => item.id);

  return strategies.map(strategy => {
    const result = loadContainer(container, cargo, { strategy, publish: false });
    const quality = assessWeightBalance(container, result);
    const floor = analyzeFloorLoad(container, result, 12, 4);
    const unloading = unloadingScore(container, cargo, result);
    const fillRatePct = clamp(result.usedVolumeM3 / totalVolume * 100);
    const loadedRatePct = clamp(result.placements.length / requestedCount * 100);
    const average = Math.max(floor.averageKgPerM2, 1);
    const peakRatio = floor.maxKgPerM2 / average;
    const floorDistributionScore = clamp(100 - Math.max(0, peakRatio - 1) * 18);
    const remainingCount = result.remaining.reduce((sum, item) => sum + item.quantity, 0);
    const commonUnloadingScore = unloading.configured ? unloading.score : 50;
    const overallScore = clamp(
      fillRatePct * 0.22
      + loadedRatePct * 0.18
      + quality.loadingQualityScore * 0.15
      + quality.stabilityScore * 0.15
      + quality.balanceScore * 0.10
      + floorDistributionScore * 0.10
      + commonUnloadingScore * 0.10,
    );
    const meta = loadingStrategyDefinition(strategy);

    return {
      strategy,
      label: meta.label,
      description: meta.description,
      result,
      fillRatePct,
      loadedRatePct,
      qualityScore: quality.loadingQualityScore,
      stabilityScore: quality.stabilityScore,
      balanceScore: quality.balanceScore,
      unloadingScore: unloading.score,
      unloadingConfigured: unloading.configured,
      maxFloorLoadKgPerM2: floor.maxKgPerM2,
      floorDistributionScore,
      overallScore,
      remainingCount,
    };
  });
}
