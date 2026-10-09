import type { CargoItem, ContainerSpec, LimitReviewMetric, LoadingResult } from './engine/types';
import { decorateLimitReview } from './engine/limitReview';
import {
  INERTIA_PASS_SHIFT_M, INERTIA_PASS_TILT_DEG, createPhysicsTargetSignature,
  type InertiaCertification,
} from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';
import { reportEscape } from './reportLayout';

export const LIMIT_REVIEW_WARNING = 'WHAT-IF REVIEW · 한도 비교 검토용 · 출고 승인 및 실제 운송 안전 인증 아님';
export const LIMIT_REVIEW_PROVENANCE = '원래 한도는 등록값·앱 기본값이며 실제 장비 명판/차량 인증 확인을 뜻하지 않습니다. 카탈로그 대표값은 실제 장비의 검증된 정격이 아닙니다. 시나리오 한도는 가정값이며 실제 한도와 오류 심각도는 변경되지 않습니다.';
type ReviewTarget = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult; mode?: PhysicsTarget['mode']; supports?: PhysicsTarget['supports'] };

export function isLimitReviewTarget(target: Pick<ReviewTarget, 'container' | 'result'> | undefined): boolean {
  return Boolean(target && (target.container.limitReview || target.result.limitReview));
}

export function limitReviewMetrics(target: ReviewTarget, certification?: InertiaCertification): LimitReviewMetric[] {
  if (!isLimitReviewTarget(target)) return [];
  const config = target.container.limitReview ?? target.result.limitReview!.config;
  const container = { ...target.container, limitReview: config };
  const metrics = decorateLimitReview(container, target.cargo, target.result).limitReview?.metrics.map(metric => ({ ...metric })) ?? [];
  // Refuse replayed/stale simulation evidence, including a changed what-if setting.
  const matching = certification && certification.targetSignature === createPhysicsTargetSignature({ ...target, mode: target.mode ?? 'boxes' });
  if (matching) {
    const payload = metrics.find(metric => metric.key === 'payload');
    if (payload) {
      payload.actual = target.result.loadedWeightKg + certification.securing.estimatedAddedWeightKg;
      payload.excess = payload.originalLimit == null ? null : Math.max(0, payload.actual - payload.originalLimit);
      payload.excessPercent = payload.originalLimit && payload.excess != null ? payload.excess / payload.originalLimit * 100 : null;
    }
    if (Object.keys(certification.results).length) {
      for (const [key, originalLimit, scenarioLimit, actual, unit] of [
        ['displacement', INERTIA_PASS_SHIFT_M * 1000, config.simulation?.maxDisplacementMm ?? INERTIA_PASS_SHIFT_M * 1000, certification.maxHorizontalShiftM * 1000, 'mm'],
        ['rotation', INERTIA_PASS_TILT_DEG, config.simulation?.maxRotationDeg ?? INERTIA_PASS_TILT_DEG, certification.maxTiltDeg, 'deg'],
      ] as const) {
        const excess = Math.max(0, actual - originalLimit);
        metrics.push({ key, originalLimit, scenarioLimit, actual, unit, excess, excessPercent: excess / originalLimit * 100, provenance: 'app-default', direction: 'maximum' });
      }
    }
  }
  return metrics;
}

const labels: Record<LimitReviewMetric['key'], string> = {
  payload: '고정재 포함 총중량', 'floor-load': '국부 바닥하중', support: '최소 지지율',
  'stack-layers': '적층단수', 'top-load': '누적 상부하중', displacement: '내부 관성 최대 이동', rotation: '내부 관성 최대 기울기',
};
const provenanceLabels: Record<LimitReviewMetric['provenance'], string> = {
  configured: '등록값 · 실물 정격 미확인', 'app-default': '앱 내부 기본값', unverified: '미검증 대표값', unknown: '근거 미확인',
};
const number = (value: number | null) => value == null || !Number.isFinite(value) ? '미확인' : Number(value.toFixed(3));

export function limitReviewRows(target: ReviewTarget, certification?: InertiaCertification) {
  return reviewRowsForMetrics(limitReviewMetrics(target, certification));
}

function reviewRowsForMetrics(metrics: LimitReviewMetric[]) {
  return metrics.map(metric => ({
    문서용도: LIMIT_REVIEW_WARNING,
    분류: metric.key === 'displacement' || metric.key === 'rotation' ? '내부 시뮬레이션 기준 · 장비 정격 아님' : '등록 한도 비교 · 실물 정격 확인 필요',
    항목: labels[metric.key], 화물: metric.cargoId ?? '', 단위: metric.unit,
    원래한도: number(metric.originalLimit), 시나리오한도: number(metric.scenarioLimit), 실제값: number(metric.actual),
    원래한도초과량: number(metric.excess), 원래한도초과율_pct: number(metric.excessPercent),
    한도방향: metric.direction === 'minimum' ? '최소값 · 미달량 표시' : '최대값',
    시나리오비교: !Number.isFinite(metric.actual) || !Number.isFinite(metric.scenarioLimit) ? '미확인'
      : (metric.direction === 'minimum' ? metric.actual >= metric.scenarioLimit : metric.actual <= metric.scenarioLimit) ? '가정 범위 이내 · 승인 아님' : '가정 범위 초과',
    근거: provenanceLabels[metric.provenance],
  }));
}

/** Standalone inertia evidence stays separate from final certification and Rapier suite results. */
export function buildLimitReviewInertiaHtml(target: ReviewTarget, evidence: { maxHorizontalShiftM: number; maxTiltDeg: number }): string {
  if (!isLimitReviewTarget(target)) return '';
  const config = target.container.limitReview ?? target.result.limitReview!.config;
  const metrics: LimitReviewMetric[] = [
    { key: 'displacement', unit: 'mm', originalLimit: INERTIA_PASS_SHIFT_M * 1000, scenarioLimit: config.simulation?.maxDisplacementMm ?? INERTIA_PASS_SHIFT_M * 1000, actual: evidence.maxHorizontalShiftM * 1000 },
    { key: 'rotation', unit: 'deg', originalLimit: INERTIA_PASS_TILT_DEG, scenarioLimit: config.simulation?.maxRotationDeg ?? INERTIA_PASS_TILT_DEG, actual: evidence.maxTiltDeg },
  ].map(metric => {
    const excess = Math.max(0, metric.actual - metric.originalLimit);
    return { ...metric, key: metric.key as LimitReviewMetric['key'], unit: metric.unit as LimitReviewMetric['unit'], excess, excessPercent: excess / metric.originalLimit * 100, provenance: 'app-default', direction: 'maximum' };
  });
  return `<h3>관성 단독 검사 · 내부 기준 / 선택 가정 비교</h3>${reviewRowsHtml(reviewRowsForMetrics(metrics))}`;
}

function reviewRowsHtml(rows: ReturnType<typeof limitReviewRows>) {
  const headers = rows.length ? Object.keys(rows[0]).filter(key => key !== '문서용도') : [];
  return rows.length ? `<div class="report-table-scroll"><table aria-label="WHAT-IF 원래 한도와 시나리오 비교"><thead><tr>${headers.map(header => `<th>${reportEscape(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(header => `<td>${reportEscape(row[header as keyof typeof row])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>비교 수치가 없습니다. 미실행·유효하지 않은 시나리오는 승인할 수 없습니다.</p>';
}

export function buildLimitReviewHtml(target: ReviewTarget, certification?: InertiaCertification): string {
  if (!isLimitReviewTarget(target)) return '';
  const rows = limitReviewRows(target, certification);
  return `<aside class="limit-review-warning" role="alert"><b>${reportEscape(LIMIT_REVIEW_WARNING)}</b><p>${reportEscape(LIMIT_REVIEW_PROVENANCE)}</p></aside>${reviewRowsHtml(rows)}`;
}
