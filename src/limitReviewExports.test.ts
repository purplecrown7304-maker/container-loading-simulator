import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhysicsTarget } from './physicsTarget';
import { clearPhysicsTarget, publishPhysicsTarget } from './physicsTarget';
import { decorateLimitReview } from './engine/limitReview';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, isInertiaStable, runInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import { assessWorkOrderCertification, completeCertificationForWorkOrder, isInertiaCertificationPassed, isPhysicsTargetVerified, workOrderTargetApprovalLabel } from './inertiaWorkOrderPolicy';
import { limitReviewRows, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { diagnosticCsv } from './diagnosticExportV2';
import { buildLoadingReportHtml } from './report';
import { readStoredState, writeStoredState } from './storage';
import { certificationVerificationState } from './workflowVerificationState';

vi.mock('./engine/inertiaSimulation', async importOriginal => ({
  ...await importOriginal<object>(), runInertiaAnimation: vi.fn(async (_container, _placements, scenario) => ({
    scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [],
    maxHorizontalShiftM: .005, maxTiltDeg: .5,
  })),
}));
const base: PhysicsTarget = {
  mode: 'boxes',
  container: { length: 1, width: 1, height: 1, maxPayloadKg: 100, limitReview: { mode: 'what-if', maxPayloadKg: 200, simulation: { maxDisplacementMm: 30, maxRotationDeg: 5 } } },
  cargo: [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: .25, y: .25, z: 0, length: .5, width: .5, height: .5, weightKg: 10 }], loadedWeightKg: 10, usedVolumeM3: .125, remaining: [], validationIssues: [] },
};
function target(maxPayloadKg = 100): PhysicsTarget {
  const t = structuredClone(base); t.container.maxPayloadKg = maxPayloadKg;
  t.result = decorateLimitReview(t.container, t.cargo, t.result);
  return t;
}
afterEach(() => { vi.clearAllMocks(); clearLatestInertiaCertification(); clearPhysicsTarget(); localStorage.clear(); });

describe('persistent WHAT-IF review-only exports', () => {
  it('never promotes a healthy under-limit review into certified PASS', async () => {
    const t = target(); publishPhysicsTarget(t);
    const cert = await runInertiaCertification(t);
    expect(cert.status).toBe('review'); expect(cert.passedScenarios).toBe(3);
    expect(cert.limitReview).toEqual(t.container.limitReview);
    expect(isInertiaCertificationPassed(cert)).toBe(false);
    expect(isPhysicsTargetVerified(t, cert)).toBe(false);
    expect(workOrderTargetApprovalLabel(t, cert)).toContain('WHAT-IF REVIEW');
    expect(certificationVerificationState(cert, t).status).toBe('review');
    const html = buildLoadingReportHtml(t.container, t.cargo, t.result);
    expect(html).toContain('class="watermark"'); expect(html).toContain(LIMIT_REVIEW_WARNING);
    expect(html).toContain('원래한도초과율_pct'); expect(html).not.toContain('완료 · PASS');
  });

  it('allows numerical review with overloaded actual payload while preserving danger and failure', async () => {
    const t = target(10); publishPhysicsTarget(t);
    const cert = await runInertiaCertification(t);
    expect(runInertiaAnimation).toHaveBeenCalledTimes(3);
    expect(cert.payloadWithinLimit).toBe(false); expect(cert.status).toBe('failed');
    expect(assessWorkOrderCertification(cert)).toBe('danger');
    expect(workOrderTargetApprovalLabel(t, cert)).toContain('위험');
    const payload = limitReviewRows(t, cert).find(row => row.항목 === '고정재 포함 총중량')!;
    expect(payload.실제값).toBeGreaterThan(10); expect(payload.원래한도초과량).toBeGreaterThan(0);
    expect(payload.시나리오한도).toBe(200);
  });

  it('never simulates or completes beyond the selected payload ceiling including securing', async () => {
    const t = target(10);
    t.container.limitReview!.maxPayloadKg = 10;
    const cert = await runInertiaCertification(t);
    expect(runInertiaAnimation).not.toHaveBeenCalled();
    expect(cert.testedScenarios).toBe(0);
    await completeCertificationForWorkOrder(t, cert);
    expect(runInertiaAnimation).not.toHaveBeenCalled();
    const exact = target(10);
    exact.container.limitReview!.maxPayloadKg = 10 + buildSecuringUsage(exact, 1).estimatedAddedWeightKg;
    const completed = await runInertiaCertification(exact);
    expect(completed.testedScenarios).toBe(3);
    expect(completed.payloadWithinLimit).toBe(false);
  });

  it('does not numerically review colliding geometry or invalid scenario settings', async () => {
    const t = target(); t.result.placements.push({ ...t.result.placements[0] });
    await runInertiaCertification(t); expect(runInertiaAnimation).not.toHaveBeenCalled();
    const invalid = target(); invalid.container.limitReview!.maxPayloadKg = Number.NaN;
    await runInertiaCertification(invalid); expect(runInertiaAnimation).not.toHaveBeenCalled();
  });

  it('compares internal baseline/scenario thresholds without changing actual failures or claiming equipment overload', async () => {
    const t = target();
    const cert = await runInertiaCertification(t);
    cert.maxHorizontalShiftM = .01612; cert.maxTiltDeg = 1.826;
    const rows = limitReviewRows(t, cert);
    const displacement = rows.find(row => row.항목 === '내부 관성 최대 이동')!;
    expect(displacement).toMatchObject({ 원래한도: 12, 시나리오한도: 30, 실제값: 16.12, 원래한도초과량: 4.12, 원래한도초과율_pct: 34.333, 분류: '내부 시뮬레이션 기준 · 장비 정격 아님' });
    expect(displacement.시나리오비교).toBe('가정 범위 이내 · 승인 아님');
    expect(isInertiaStable({ ...cert.results.cornering!, maxHorizontalShiftM: .01612, maxTiltDeg: 1.826 })).toBe(false);
  });

  it('rejects stale simulation comparisons when review thresholds change', async () => {
    const t = target(); const cert = await runInertiaCertification(t);
    const changed = structuredClone(t); changed.container.limitReview!.simulation!.maxRotationDeg = 6;
    expect(createPhysicsTargetSignature(changed)).not.toBe(cert.targetSignature);
    expect(limitReviewRows(changed, cert).some(row => row.항목 === '내부 관성 최대 이동')).toBe(false);
    expect(isPhysicsTargetVerified(changed, cert)).toBe(false);
  });

  it('keeps stored and restored review mode and its scenario values', () => {
    const t = target(); writeStoredState(t);
    expect(readStoredState()!.container.limitReview).toEqual(t.container.limitReview);
    expect(JSON.parse(JSON.stringify(t.result)).limitReview.mode).toBe('what-if');
  });

  it('carries permanent warnings on every CSV row and on empty CSV files', () => {
    const csv = diagnosticCsv([{ no: 1 }, { no: 2 }], true);
    expect(csv.split(LIMIT_REVIEW_WARNING).length - 1).toBe(2);
    expect(diagnosticCsv([], true)).toContain(LIMIT_REVIEW_WARNING);
    expect(diagnosticCsv([{ no: 1 }])).not.toContain('WHAT-IF');
  });

  it('also rejects an old passed certification attached to a review target', async () => {
    const t = target(); const cert = await runInertiaCertification(t);
    const legacy = { ...cert, status: 'passed', limitReview: undefined } as InertiaCertification;
    expect(isPhysicsTargetVerified(t, legacy)).toBe(false);
  });
});
