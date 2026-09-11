import type { ContainerSpec, LoadingResult } from './types';

const EPS = 1e-9;

export type AxleLoadAssessment = {
  frontKg: number;
  rearKg: number;
  frontRatePct?: number;
  rearRatePct?: number;
  score: number;
};

/**
 * 두 축 사이 단순보 정역학으로 적재 화물의 축 반력을 계산한다.
 * 차량 공차중량/축 자체 하중은 데이터에 없으므로 포함하지 않는다.
 * 따라서 앞/뒤 축 위치가 명시된 차량에서 '적재 화물 분담' 평가용으로만 사용한다.
 */
export function assessAxleLoads(container: ContainerSpec, result: LoadingResult): AxleLoadAssessment | undefined {
  const frontX = container.frontAxleX;
  const rearX = container.rearAxleX;
  if (!Number.isFinite(frontX) || !Number.isFinite(rearX) || (rearX as number) - (frontX as number) <= EPS) return undefined;
  if (!result.placements.length || result.loadedWeightKg <= EPS) return { frontKg: 0, rearKg: 0, score: 100 };

  const total = result.placements.reduce((sum, item) => sum + item.weightKg, 0);
  if (total <= EPS) return { frontKg: 0, rearKg: 0, score: 100 };
  const cogX = result.placements.reduce((sum, item) => sum + (item.x + item.length / 2) * item.weightKg, 0) / total;
  const span = (rearX as number) - (frontX as number);
  const rearKg = total * (cogX - (frontX as number)) / span;
  const frontKg = total - rearKg;
  const frontMax = container.frontAxleMaxKg;
  const rearMax = container.rearAxleMaxKg;
  const frontRatePct = Number.isFinite(frontMax) && (frontMax as number) > EPS ? frontKg / (frontMax as number) * 100 : undefined;
  const rearRatePct = Number.isFinite(rearMax) && (rearMax as number) > EPS ? rearKg / (rearMax as number) * 100 : undefined;

  let score = 100;
  // 축 사이를 벗어난 CG로 음의 반력이 생기면 매우 불리하게 본다.
  if (frontKg < -EPS || rearKg < -EPS) score -= 70;
  if (frontRatePct != null && rearRatePct != null) {
    score -= Math.min(45, Math.abs(frontRatePct - rearRatePct) * 0.45);
    score -= Math.max(0, frontRatePct - 100) * 2.5;
    score -= Math.max(0, rearRatePct - 100) * 2.5;
  } else {
    score -= Math.min(30, Math.abs(frontKg - rearKg) / Math.max(total, EPS) * 30);
  }

  return {
    frontKg: Math.max(0, frontKg),
    rearKg: Math.max(0, rearKg),
    frontRatePct,
    rearRatePct,
    score: Math.max(0, Math.min(100, score)),
  };
}
