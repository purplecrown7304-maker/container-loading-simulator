import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { assessShapeQuality } from './shapeQuality';
import { assessWeightBalance } from './weightBalance';

export type UserLoadingStrategy = 'auto' | 'capacity' | 'balance' | 'safety' | 'unloading' | 'grouping';
export type ConcreteLoadingStrategy = Exclude<UserLoadingStrategy, 'auto'>;
export type LegacyLoadingStrategy = 'capacity' | 'stability' | 'unloading';

export type StrategyWeights = {
  utilization: number;
  balance: number;
  stability: number;
  operations: number;
  grouping: number;
  void: number;
};

export type StrategyDecision = {
  requestedStrategy: UserLoadingStrategy;
  selectedStrategy: ConcreteLoadingStrategy;
  weights: StrategyWeights;
  reasons: string[];
  componentScores: StrategyWeights;
  totalScore: number;
  axleLoads?: { frontKg: number; rearKg: number; frontRatePct?: number; rearRatePct?: number };
};

export const LOADING_STRATEGY_SELECTION_KEY = 'container-loading-user-strategy-v2';
export const LOADING_STRATEGY_SELECTION_EVENT = 'container-loading:user-strategy-updated';
export const LOADING_STRATEGY_DECISION_EVENT = 'container-loading:strategy-decision';

export const STRATEGY_LABELS: Record<UserLoadingStrategy, string> = {
  auto: '자동 최적화',
  capacity: '최대 적재',
  balance: '무게 균형',
  safety: '안전 적재',
  unloading: '하차 순서 우선',
  grouping: '동일 제품 묶음 적재',
};

export const DEFAULT_AUTO_WEIGHTS: StrategyWeights = {
  utilization: 0.30,
  balance: 0.20,
  stability: 0.20,
  operations: 0.15,
  grouping: 0.10,
  void: 0.05,
};

const MODE_WEIGHTS: Record<ConcreteLoadingStrategy, StrategyWeights> = {
  capacity: { utilization: .47, balance: .08, stability: .15, operations: .05, grouping: .08, void: .17 },
  balance: { utilization: .12, balance: .48, stability: .20, operations: .05, grouping: .05, void: .10 },
  safety: { utilization: .08, balance: .18, stability: .55, operations: .07, grouping: .04, void: .08 },
  unloading: { utilization: .10, balance: .12, stability: .18, operations: .47, grouping: .08, void: .05 },
  grouping: { utilization: .15, balance: .10, stability: .16, operations: .07, grouping: .44, void: .08 },
};

function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
function coeffVar(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
function normalizeWeights(input: StrategyWeights): StrategyWeights {
  const sum = Object.values(input).reduce((total, value) => total + Math.max(0, value), 0) || 1;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Math.max(0, value) / sum])) as StrategyWeights;
}

export function readUserLoadingStrategy(): UserLoadingStrategy {
  if (typeof window === 'undefined') return 'auto';
  const value = window.localStorage.getItem(LOADING_STRATEGY_SELECTION_KEY) as UserLoadingStrategy | null;
  return value && value in STRATEGY_LABELS ? value : 'auto';
}

export function writeUserLoadingStrategy(strategy: UserLoadingStrategy) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOADING_STRATEGY_SELECTION_KEY, strategy);
  window.dispatchEvent(new CustomEvent<UserLoadingStrategy>(LOADING_STRATEGY_SELECTION_EVENT, { detail: strategy }));
}

export function publishStrategyDecision(decision: StrategyDecision) {
  if (typeof window === 'undefined') return;
  (window as Window & { __containerLoadingStrategyDecision?: StrategyDecision }).__containerLoadingStrategyDecision = decision;
  window.dispatchEvent(new CustomEvent<StrategyDecision>(LOADING_STRATEGY_DECISION_EVENT, { detail: decision }));
}

export function readStrategyDecision(): StrategyDecision | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { __containerLoadingStrategyDecision?: StrategyDecision }).__containerLoadingStrategyDecision;
}

export function legacyStrategyFor(mode: ConcreteLoadingStrategy): LegacyLoadingStrategy {
  if (mode === 'capacity' || mode === 'grouping') return 'capacity';
  if (mode === 'unloading') return 'unloading';
  return 'stability';
}

export function cargoForStrategy(cargo: CargoItem[], mode: ConcreteLoadingStrategy): CargoItem[] {
  if (mode !== 'safety') return cargo.map(item => ({ ...item }));
  return cargo.map(item => {
    const stableHeight = Math.max(item.height, Math.min(item.length, item.width) * 1.25);
    const byShape = Math.max(1, Math.floor(stableHeight / Math.max(item.height, 0.001)));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return { ...item, maxStackLayers: Math.max(1, Math.min(configured, byShape, 4)) };
  });
}

export function analyzeCargoForAuto(cargo: CargoItem[]): { weights: StrategyWeights; reasons: string[] } {
  const active = cargo.filter(item => item.quantity > 0);
  const weights = { ...DEFAULT_AUTO_WEIGHTS };
  const reasons: string[] = [];
  if (!active.length) return { weights, reasons: ['적재 화물이 없어 기본 가중치를 사용합니다.'] };
  const totalQty = active.reduce((sum, item) => sum + item.quantity, 0);
  const dominantQty = Math.max(...active.map(item => item.quantity));
  const dominantRatio = totalQty > 0 ? dominantQty / totalQty : 0;
  if (active.length <= 4 && dominantRatio >= 0.45) {
    weights.grouping += 0.10; weights.utilization += 0.02;
    reasons.push('SKU 종류가 적고 특정 제품 수량이 많아 동일 제품 묶음 비중을 높였습니다.');
  }
  const volumeCv = coeffVar(active.map(item => item.length * item.width * item.height));
  if (volumeCv >= 0.55) {
    weights.utilization += 0.10; weights.void += 0.06;
    reasons.push('박스 크기 편차가 커 공간 활용과 빈 공간 억제 비중을 높였습니다.');
  }
  const weightCv = coeffVar(active.map(item => item.weightKg));
  if (weightCv >= 0.55) {
    weights.balance += 0.10; weights.stability += 0.07;
    reasons.push('박스별 중량 차이가 커 무게 균형과 안정성 비중을 높였습니다.');
  }
  const unloadStops = new Set(active.map(item => item.unloadPriority).filter((value): value is number => Number.isFinite(value)));
  if (unloadStops.size >= 2) {
    weights.operations += 0.14;
    reasons.push('하차 순서가 여러 단계라 하차 접근성 비중을 높였습니다.');
  }
  const heavyRatio = active.filter(item => item.weightKg >= 500).reduce((sum, item) => sum + item.quantity, 0) / Math.max(1, totalQty);
  if (heavyRatio >= 0.25) {
    weights.balance += 0.07; weights.stability += 0.08;
    reasons.push('고중량 화물 비중이 높아 무게중심과 저상 안정성을 강화했습니다.');
  }
  if (!reasons.length) reasons.push('화물 특성이 한쪽으로 치우치지 않아 기본 종합 가중치를 사용합니다.');
  return { weights: normalizeWeights(weights), reasons };
}

function unloadingScore(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const priorities = cargo.filter(item => Number.isFinite(item.unloadPriority));
  if (priorities.length < 2 || !result.placements.length) return 85;
  const byId = new Map(cargo.map(item => [item.id, item]));
  const values = priorities.map(item => item.unloadPriority as number);
  const min = Math.min(...values), max = Math.max(...values);
  if (max <= min) return 100;
  let total = 0, count = 0;
  for (const placement of result.placements) {
    const item = byId.get(placement.cargoId);
    if (!item || !Number.isFinite(item.unloadPriority)) continue;
    const desired = 1 - (((item.unloadPriority as number) - min) / (max - min));
    const actual = (placement.x + placement.length / 2) / Math.max(0.001, container.length);
    total += clamp((1 - Math.abs(actual - desired)) * 100);
    count += 1;
  }
  return count ? total / count : 85;
}

function groupingScore(container: ContainerSpec, result: LoadingResult) {
  if (!result.placements.length) return 100;
  const shape = assessShapeQuality(container, result.placements);
  return clamp(100 - shape.fragmentedCargoTypes * 20);
}

export function scoreStrategyResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, weights: StrategyWeights, physicsScore: number) {
  const volume = Math.max(0.001, container.length * container.width * container.height);
  const utilization = clamp(result.usedVolumeM3 / volume * 100);
  const balanceAssessment = assessWeightBalance(container, result);
  const balance = balanceAssessment.balanceScore;
  const stability = clamp(balanceAssessment.stabilityScore * 0.55 + physicsScore * 0.45);
  const operations = unloadingScore(container, cargo, result);
  const grouping = groupingScore(container, result);
  const shape = assessShapeQuality(container, result.placements);
  const void = clamp(100 - shape.shapePenalty * 4 - Math.max(0, 70 - utilization) * 0.35);
  const componentScores: StrategyWeights = { utilization, balance, stability, operations, grouping, void };
  const totalScore = Object.entries(weights).reduce((sum, [key, weight]) => sum + componentScores[key as keyof StrategyWeights] * weight, 0);
  return { componentScores, totalScore: clamp(totalScore) };
}

export function weightsForExplicitStrategy(strategy: ConcreteLoadingStrategy) { return MODE_WEIGHTS[strategy]; }
