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
