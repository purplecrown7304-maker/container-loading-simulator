import { analyzeFloorLoad } from './floorLoad';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
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

const strategyMeta: Record<LoadingStrategy, { label: string; description: string }> = {
  capacity: { label: '최대 적재율형', description: 'CBM과 중량 수요가 큰 품목을 우선해 공간 활용을 높입니다.' },
  stability: { label: '안정성 우선형', description: '무겁고 바닥면이 큰 화물을 안쪽·아래쪽에 먼저 배치합니다.' },
  unloading: { label: '하역 편의형', description: '하역 순서가 늦은 화물을 안쪽, 먼저 꺼낼 화물을 문쪽에 배치합니다.' },
};

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
  const strategies: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];

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

    return {
      strategy,
      ...strategyMeta[strategy],
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
