import { describe, expect, it } from 'vitest';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsTarget } from './physicsTarget';
import { buildInertiaImprovementReportHtml } from './inertiaReport';

const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 6, width: 2.35, height: 2.4, maxPayloadKg: 20000 }, cargo: [],
  result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
};
const stable: InertiaAnimationResult = { scenario: 'acceleration', fps: 30, simulatedSeconds: 4, cargoCount: 0, supportCount: 0, frames: [], maxHorizontalShiftM: 0.001, maxTiltDeg: 0.1 };

describe('inertia report completion status', () => {
  it('does not present partial stable results as ready for a work order', () => {
    const html = buildInertiaImprovementReportHtml(target, { acceleration: stable });
    expect(html).toContain('검증 미완료 · 남은 시나리오 실행 필요');
    expect(html).toContain('미실행');
    expect(html).not.toContain('안정 · 작업지시서 생성 가능');
  });
  it('shows completed stable results only after all three scenarios ran', () => {
    const html = buildInertiaImprovementReportHtml(target, {
      acceleration: stable, braking: { ...stable, scenario: 'braking' }, cornering: { ...stable, scenario: 'cornering' },
    });
    expect(html).toContain('안정 · 작업지시서 생성 가능');
    expect(html).not.toContain('검증 미완료');
    expect(buildInertiaImprovementReportHtml(target, {})).toBeNull();
  });
});

it('keeps completed standalone inertia comparisons review-only with baseline and scenario values', () => {
  const reviewTarget: PhysicsTarget = { ...target, container: { ...target.container, limitReview: { mode: 'what-if', simulation: { maxDisplacementMm: 30, maxRotationDeg: 5 } } } };
  const html = buildInertiaImprovementReportHtml(reviewTarget, {
    acceleration: stable, braking: { ...stable, scenario: 'braking' }, cornering: { ...stable, scenario: 'cornering', maxHorizontalShiftM: .01612, maxTiltDeg: 1.826 },
  });
  expect(html).toContain('WHAT-IF REVIEW'); expect(html).toContain('class="watermark"');
  expect(html).toContain('시나리오한도'); expect(html).toContain('원래한도초과량');
  expect(html).toContain('16.12'); expect(html).toContain('34.333');
  expect(html).not.toContain('안정 · 작업지시서 생성 가능');
});
