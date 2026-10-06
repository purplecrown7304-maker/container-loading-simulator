import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmUnverifiedExport, hasCurrentInertiaCompletion, hasCurrentInertiaVerification, hasCurrentPhysicsVerification, hasCurrentWorkOrderResult } from './exportVerification';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { buildLoadingReportHtml } from './report';

const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: .3, width: .3, height: .3, weightKg: 1, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] },
};
function current(overrides: Partial<InertiaCertification> = {}, currentTarget = target) {
  publishPhysicsTarget(currentTarget);
  const certification: InertiaCertification = {
    status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(currentTarget), testedAt: new Date(0).toISOString(),
    securing: buildSecuringUsage(currentTarget, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [],
    maxHorizontalShiftM: .005, maxTiltDeg: .5, payloadWithinLimit: true,
    results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])),
    ...overrides,
  };
  (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = certification;
  return certification;
}
afterEach(() => { clearLatestInertiaCertification(); clearPhysicsTarget(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('verification and review output are separate', () => {
  it('requires complete strict PASS before clearing the report watermark', () => {
    current();
    expect(hasCurrentInertiaCompletion()).toBe(true);
    expect(hasCurrentInertiaVerification()).toBe(true);
    expect(hasCurrentPhysicsVerification()).toBe(true);
    expect(hasCurrentWorkOrderResult()).toBe(true);
    const html = buildLoadingReportHtml(target.container, target.cargo, target.result);
    expect(html).toContain('물리검증: 완료 · PASS');
    expect(html).not.toContain('검토용 · 검증 확인 필요');
  });

  it('exports the exact zero-scenario payload failure only as a marked review document', () => {
    current({ status: 'failed', payloadWithinLimit: false, testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'], results: {} });
    expect(hasCurrentInertiaCompletion()).toBe(false);
    expect(hasCurrentPhysicsVerification()).toBe(false);
    expect(hasCurrentWorkOrderResult()).toBe(true);
    expect(confirmUnverifiedExport('검토용 작업지시서')).toBe(true);
    const html = buildLoadingReportHtml(target.container, target.cargo, target.result);
    expect(html).toContain('검토용 · 검증 확인 필요');
    expect(html).toContain('물리검증: 미완료');
    expect(html).toContain('허용중량을 초과');
    expect(html).not.toContain('물리검증: 완료');
    expect(html).not.toContain('검증 판정: PASS');
  });

  it('distinguishes completed failed tests from PASS', () => {
    current({ status: 'failed' });
    expect(hasCurrentInertiaCompletion()).toBe(true);
    expect(hasCurrentPhysicsVerification()).toBe(false);
    expect(confirmUnverifiedExport('review')).toBe(true);
    const html = buildLoadingReportHtml(target.container, target.cargo, target.result);
    expect(html).toContain('검사 완료 · 미통과');
    expect(html).toContain('검증 판정: 주의 · 검토용');
    expect(html).not.toContain('주의 승인');
  });

  it.each(['missing', 'nonfinite', 'inconsistent'])('rejects a claimed PASS with %s scenario evidence', kind => {
    const cert = current();
    if (kind === 'missing') delete cert.results.cornering;
    if (kind === 'nonfinite') cert.results.braking!.maxTiltDeg = NaN;
    if (kind === 'inconsistent') cert.passedScenarios = 0;
    expect(hasCurrentPhysicsVerification()).toBe(false);
  });

  it.each(['validation', 'operational'])('does not certify a static %s failure even when inertia passes', kind => {
    const failedTarget: PhysicsTarget = { ...target, result: { ...target.result,
      validationIssues: kind === 'validation' ? [{ type: 'COLLISION', message: '충돌', placementIndexes: [0] }] : [],
      operationalFindings: kind === 'operational' ? [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 허용범위 초과', placementIndexes: [] }] : [],
    } };
    current({}, failedTarget);
    expect(hasCurrentInertiaCompletion()).toBe(true);
    expect(hasCurrentPhysicsVerification()).toBe(false);
    const html = buildLoadingReportHtml(failedTarget.container, failedTarget.cargo, failedTarget.result);
    expect(html).toContain('검증 판정: 적재 제약 실패');
    expect(html).toContain('검토용 · 검증 확인 필요');
  });

  it('rejects stale output and never borrows another displayed plan’s PASS', () => {
    const cert = current();
    cert.targetSignature = 'old';
    vi.stubGlobal('alert', vi.fn());
    expect(hasCurrentInertiaCompletion()).toBe(false);
    expect(hasCurrentWorkOrderResult()).toBe(false);
    expect(confirmUnverifiedExport('review')).toBe(false);
    current();
    const staleResult = { ...target.result, placements: [{ ...target.result.placements[0], x: 1 }] };
    expect(buildLoadingReportHtml(target.container, target.cargo, staleResult)).toContain('물리검증: 미완료');
    expect(buildLoadingReportHtml(target.container, target.cargo, staleResult)).toContain('검토용 · 검증 확인 필요');
  });
});
