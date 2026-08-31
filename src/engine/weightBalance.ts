import type { ContainerSpec, LoadingResult, Placement } from './types';
import { assessShapeQuality } from './shapeQuality';

export type BalanceAssessment = {
  centerOfGravity: { x: number; y: number; z: number };
  normalized: { x: number; y: number; z: number };
  longitudinalDeviationPct: number;
  lateralDeviationPct: number;
  verticalCenterPct: number;
  lowerHeavyRatio: number;
  /** 호환용 지표: 컨테이너 안쪽 절반에 놓인 중량 비율. 높을수록 좋다는 의미는 더 이상 없다. */
  innerHeavyRatio: number;
  balanceScore: number;
  stabilityScore: number;
  loadingQualityScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  messages: string[];
};

function weightedAverage(placements: Placement[], coordinate: (p: Placement) => number) {
  const total = placements.reduce((sum, p) => sum + p.weightKg, 0);
  if (total <= 0) return 0;
  return placements.reduce((sum, p) => sum + coordinate(p) * p.weightKg, 0) / total;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function assessWeightBalance(container: ContainerSpec, result: LoadingResult): BalanceAssessment {
  const placements = result.placements;
  if (placements.length === 0 || result.loadedWeightKg <= 0) {
    return {
      centerOfGravity: { x: 0, y: 0, z: 0 }, normalized: { x: 0, y: 0, z: 0 },
      longitudinalDeviationPct: 0, lateralDeviationPct: 0, verticalCenterPct: 0,
      lowerHeavyRatio: 0, innerHeavyRatio: 0, balanceScore: 0, stabilityScore: 0,
      loadingQualityScore: 0, grade: 'E', messages: ['적재된 화물이 없어 품질 평가를 계산할 수 없습니다.'],
    };
  }

  const cogX = weightedAverage(placements, (p) => p.x + p.length / 2);
  const cogY = weightedAverage(placements, (p) => p.y + p.width / 2);
  const cogZ = weightedAverage(placements, (p) => p.z + p.height / 2);
  const nx = container.length > 0 ? cogX / container.length : 0;
  const ny = container.width > 0 ? cogY / container.width : 0;
  const nz = container.height > 0 ? cogZ / container.height : 0;
  const longitudinalDeviationPct = Math.abs(nx - 0.5) * 200;
  const lateralDeviationPct = Math.abs(ny - 0.5) * 200;
  const verticalCenterPct = nz * 100;
  const totalWeight = result.loadedWeightKg;
  const lowerHalfWeight = placements
    .filter((p) => p.z + p.height / 2 <= container.height / 2)
    .reduce((sum, p) => sum + p.weightKg, 0);
  const innerHalfWeight = placements
    .filter((p) => p.x + p.length / 2 <= container.length / 2)
    .reduce((sum, p) => sum + p.weightKg, 0);
  const lowerHeavyRatio = totalWeight > 0 ? lowerHalfWeight / totalWeight : 0;
  const innerHeavyRatio = totalWeight > 0 ? innerHalfWeight / totalWeight : 0;
  const maxLongitudinalHalfRatio = Math.max(innerHeavyRatio, 1 - innerHeavyRatio);

  const balanceScore = clampScore(100 - longitudinalDeviationPct * 0.9 - lateralDeviationPct * 1.25);
  const verticalPenalty = Math.max(0, verticalCenterPct - 35) * 1.35;
  const lowerBonus = Math.max(0, lowerHeavyRatio - 0.5) * 35;
  const longitudinalConcentrationPenalty = Math.max(0, maxLongitudinalHalfRatio - 0.6) * 110;
  const lateralPenalty = Math.max(0, lateralDeviationPct - 10) * 0.4;
  const stabilityScore = clampScore(88 - verticalPenalty + lowerBonus - longitudinalConcentrationPenalty - lateralPenalty);
  const validationPenalty = result.validationIssues.length * 25;
  const shape = assessShapeQuality(container, placements);
  const loadingQualityScore = clampScore(balanceScore * 0.45 + stabilityScore * 0.55 - validationPenalty - shape.shapePenalty);
  const grade: BalanceAssessment['grade'] = loadingQualityScore >= 90 ? 'A' : loadingQualityScore >= 80 ? 'B' : loadingQualityScore >= 70 ? 'C' : loadingQualityScore >= 60 ? 'D' : 'E';

  const messages: string[] = [];
  messages.push(lateralDeviationPct <= 10 ? '좌우 무게중심이 중앙에 가깝습니다.' : `좌우 무게중심 편차가 ${lateralDeviationPct.toFixed(1)}%입니다.`);
  messages.push(longitudinalDeviationPct <= 15 ? '앞뒤 무게분포가 비교적 균형적입니다.' : `앞뒤 무게중심 편차가 ${longitudinalDeviationPct.toFixed(1)}%입니다.`);
  messages.push(verticalCenterPct <= 40 ? '무게중심 높이가 낮아 안정적인 편입니다.' : `무게중심 높이가 컨테이너 높이의 ${verticalCenterPct.toFixed(1)}%로 높습니다.`);
  messages.push(maxLongitudinalHalfRatio <= 0.6
    ? '컨테이너 길이 절반 어느 쪽도 총중량의 60%를 넘지 않아 종방향 분포가 양호합니다.'
    : `컨테이너 길이 절반 한쪽에 총중량의 ${(maxLongitudinalHalfRatio * 100).toFixed(1)}%가 몰려 있습니다.`);
  messages.push(...shape.messages);

  return {
    centerOfGravity: { x: cogX, y: cogY, z: cogZ },
    normalized: { x: nx, y: ny, z: nz },
    longitudinalDeviationPct, lateralDeviationPct, verticalCenterPct,
    lowerHeavyRatio, innerHeavyRatio, balanceScore, stabilityScore, loadingQualityScore, grade, messages,
  };
}
