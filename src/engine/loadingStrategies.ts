export type LoadingStrategy =
  | 'balanced'
  | 'capacity'
  | 'stability'
  | 'center-of-gravity'
  | 'floor-balance'
  | 'unloading';

export type BasePackingStrategy = 'capacity' | 'stability' | 'unloading';

export type LoadingStrategyDefinition = {
  id: LoadingStrategy;
  label: string;
  shortLabel: string;
  description: string;
  baseStrategy: BasePackingStrategy;
};

export const LOADING_STRATEGIES: readonly LoadingStrategyDefinition[] = [
  {
    id: 'balanced',
    label: '균형형',
    shortLabel: '균형',
    description: '공간 활용, 안정성, 무게분포, 하역성을 고르게 평가합니다.',
    baseStrategy: 'stability',
  },
  {
    id: 'capacity',
    label: '공간 활용형',
    shortLabel: '공간',
    description: '안전 제약을 지키면서 적재 수량과 공간 활용률을 가장 크게 평가합니다.',
    baseStrategy: 'capacity',
  },
  {
    id: 'stability',
    label: '안전 우선형',
    shortLabel: '안전',
    description: '낮은 무게중심, 접촉 안정성, 전체 물리 품질을 우선합니다.',
    baseStrategy: 'stability',
  },
  {
    id: 'center-of-gravity',
    label: '무게중심형',
    shortLabel: '무게중심',
    description: '전후·좌우 중심 편차와 수직 무게중심 높이를 강하게 줄입니다.',
    baseStrategy: 'stability',
  },
  {
    id: 'floor-balance',
    label: '하중 분산형',
    shortLabel: '하중분산',
    description: '국부 바닥하중과 좌우·전후 중량 집중을 줄이는 배치를 우선합니다.',
    baseStrategy: 'stability',
  },
  {
    id: 'unloading',
    label: '하역 우선형',
    shortLabel: '하역',
    description: '먼저 내릴 화물을 문쪽에 두는 순서를 안전 제약 안에서 우선합니다.',
    baseStrategy: 'unloading',
  },
] as const;

const STRATEGY_IDS = new Set<LoadingStrategy>(LOADING_STRATEGIES.map((item) => item.id));

export function isLoadingStrategy(value: unknown): value is LoadingStrategy {
  return typeof value === 'string' && STRATEGY_IDS.has(value as LoadingStrategy);
}

export function normalizeLoadingStrategy(value: unknown, fallback: LoadingStrategy = 'balanced'): LoadingStrategy {
  return isLoadingStrategy(value) ? value : fallback;
}

export function basePackingStrategy(strategy: LoadingStrategy): BasePackingStrategy {
  return LOADING_STRATEGIES.find((item) => item.id === strategy)?.baseStrategy ?? 'stability';
}

export function loadingStrategyDefinition(strategy: LoadingStrategy): LoadingStrategyDefinition {
  return LOADING_STRATEGIES.find((item) => item.id === strategy) ?? LOADING_STRATEGIES[0];
}
