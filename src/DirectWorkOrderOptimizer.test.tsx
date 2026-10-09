import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { buildDirectResultReoptimizationCandidatesAsync, buildSecuringPayloadAdjustmentCandidateAsync } from './engine/finalResultOptimization';
import { buildSecuringUsage, createPhysicsTargetSignature, runInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { completeCertificationForWorkOrder } from './inertiaWorkOrderPolicy';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { WORKFLOW_VERIFICATION_CANCELLED_EVENT } from './workflowVerificationState';

vi.mock('./engine/finalResultOptimization', async importOriginal => ({ ...await importOriginal<object>(), buildDirectResultReoptimizationCandidatesAsync: vi.fn(), buildSecuringPayloadAdjustmentCandidateAsync: vi.fn() }));
vi.mock('./inertiaCertification', async importOriginal => ({ ...await importOriginal<object>(), runInertiaCertification: vi.fn() }));
vi.mock('./inertiaWorkOrderPolicy', async importOriginal => ({ ...await importOriginal<object>(), completeCertificationForWorkOrder: vi.fn() }));
vi.mock('./report', () => ({ openLoadingReport: vi.fn() }));

const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: 0.3, width: 0.3, height: 0.3, weightKg: 1, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.3, width: 0.3, height: 0.3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: 0.027, validationIssues: [] },
};
let host: HTMLDivElement;
let root: Root;
let certification: InertiaCertification;
let searchSignal: AbortSignal | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  clearPhysicsTarget();
  certification = { status: 'failed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: new Date().toISOString(), securing: buildSecuringUsage(target, 3), testedScenarios: 3, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'], maxHorizontalShiftM: 0.1, maxTiltDeg: 10, results: {}, payloadWithinLimit: true };
  for (const scenario of ['acceleration', 'braking', 'cornering'] as const) certification.results[scenario] = { scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: 0.1, maxTiltDeg: 10 };
  vi.mocked(runInertiaCertification).mockResolvedValue(certification);
  vi.mocked(completeCertificationForWorkOrder).mockResolvedValue(certification);
  vi.mocked(openLoadingReport).mockReturnValue(false);
  vi.mocked(buildSecuringPayloadAdjustmentCandidateAsync).mockResolvedValue(null);
  vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockImplementation((_target, _limit, _cancelled, options) => {
    searchSignal = options?.signal;
    options?.onProgress?.({ completed: 0, total: 7, label: '안정성 우선' });
    return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('취소됨', 'AbortError'))));
  });
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<DirectWorkOrderOptimizer />); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); });
const request = () => act(async () => { requestDirectWorkOrder(target.container, target.cargo, target.result); });
const click = (label: string) => act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click(); });

describe('work-order optimizer recovery', () => {
  it('shows the additional search separately, cancels its worker, and retries a blocked popup without recalculation', async () => {
    await request();
    expect(host.textContent).toContain('추가 배치 계산 0/7회');
    expect(host.querySelector('progress')?.value).toBeLessThan(100);
    expect(host.textContent).not.toContain('현재 보강');
    await click('비교 중단하고 현재 검증 결과로 발급');
    expect(searchSignal?.aborted).toBe(true);
    expect(openLoadingReport).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('위험');
    expect(host.textContent).toContain('팝업이 차단');
    const published = (window as any).__containerLoadingLatestCertification;
    expect(published.status).toBe('failed');
    expect(published.searchNotice).toContain('비교를 중단');
    vi.mocked(openLoadingReport).mockReturnValue(true);
    await click('작업지시서 열기');
    expect(openLoadingReport).toHaveBeenCalledTimes(2);
    expect(runInertiaCertification).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('finishes on the verified baseline when optional search times out', async () => {
    vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockResolvedValue({ candidates: [], timedOut: true });
    await request();
    expect(openLoadingReport).toHaveBeenCalledWith(target.container, target.cargo, target.result);
    expect(host.textContent).toContain('시간 제한');
    expect((window as any).__containerLoadingLatestCertification.status).toBe('failed');
    expect((window as any).__containerLoadingLatestCertification.searchNotice).toContain('모든 후보를 탐색한 결과는 아닙니다');
  });



  it('automatic final loading searches safer layouts when the baseline is only caution', async () => {
    const caution: InertiaCertification = {
      ...certification,
      status: 'failed',
      maxHorizontalShiftM: 0.02,
      maxTiltDeg: 2.2,
      passedScenarios: 0,
      failedScenarios: ['acceleration', 'braking', 'cornering'],
      results: {},
    };
    for (const scenario of ['acceleration', 'braking', 'cornering'] as const) {
      caution.results[scenario] = {
        scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [],
        maxHorizontalShiftM: 0.02, maxTiltDeg: 2.2,
      };
    }
    const saferResult = {
      ...target.result,
      placements: [{ ...target.result.placements[0], x: 0.6 }],
    };
    const saferTarget: PhysicsTarget = { ...target, result: saferResult };
    const passed: InertiaCertification = {
      ...caution,
      status: 'passed',
      targetSignature: createPhysicsTargetSignature(saferTarget),
      passedScenarios: 3,
      failedScenarios: [],
      maxHorizontalShiftM: 0.004,
      maxTiltDeg: 0.6,
      results: {},
    };
    for (const scenario of ['acceleration', 'braking', 'cornering'] as const) {
      passed.results[scenario] = {
        scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [],
        maxHorizontalShiftM: 0.004, maxTiltDeg: 0.6,
      };
    }

    vi.mocked(runInertiaCertification)
      .mockResolvedValueOnce(caution)
      .mockResolvedValueOnce(passed);
    vi.mocked(completeCertificationForWorkOrder)
      .mockResolvedValueOnce(caution)
      .mockResolvedValueOnce(passed);
    vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockResolvedValue({
      candidates: [{ label: '저중심 재배치', result: saferResult, target: saferTarget, staticPenalty: -1 }],
      timedOut: false,
    });

    await act(async () => {
      requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport: false });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(buildDirectResultReoptimizationCandidatesAsync).toHaveBeenCalledOnce();
    expect(runInertiaCertification).toHaveBeenCalledTimes(2);
    expect((window as any).__containerLoadingLatestCertification.status).toBe('passed');
    expect(createPhysicsTargetSignature((window as any).__containerLoadingPhysicsTarget)).toBe(createPhysicsTargetSignature(saferTarget));
    expect(openLoadingReport).not.toHaveBeenCalled();
  });



  it('automatic final loading still compares low-CG candidates when the tall baseline already passes', async () => {
    const baselinePass: InertiaCertification = {
      ...certification,
      status: 'passed',
      testedScenarios: 3,
      passedScenarios: 3,
      failedScenarios: [],
      maxHorizontalShiftM: 0.011,
      maxTiltDeg: 1.7,
      results: {},
    };
    for (const scenario of ['acceleration', 'braking', 'cornering'] as const) {
      baselinePass.results[scenario] = {
        scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [],
        maxHorizontalShiftM: 0.011, maxTiltDeg: 1.7,
      };
    }
    const saferResult = {
      ...target.result,
      placements: [{ ...target.result.placements[0], x: 0.8 }],
    };
    const saferTarget: PhysicsTarget = { ...target, result: saferResult };
    const saferPass: InertiaCertification = {
      ...baselinePass,
      targetSignature: createPhysicsTargetSignature(saferTarget),
      maxHorizontalShiftM: 0.002,
      maxTiltDeg: 0.3,
      results: {},
    };
    for (const scenario of ['acceleration', 'braking', 'cornering'] as const) {
      saferPass.results[scenario] = {
        scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [],
        maxHorizontalShiftM: 0.002, maxTiltDeg: 0.3,
      };
    }

    vi.mocked(runInertiaCertification)
      .mockResolvedValueOnce(baselinePass)
      .mockResolvedValueOnce(saferPass);
    vi.mocked(completeCertificationForWorkOrder)
      .mockResolvedValueOnce(baselinePass)
      .mockResolvedValueOnce(saferPass);
    vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockResolvedValue({
      candidates: [{ label: '저중심 재배치', result: saferResult, target: saferTarget, staticPenalty: -1 }],
      timedOut: false,
    });

    await act(async () => {
      requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport: false });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(buildDirectResultReoptimizationCandidatesAsync).toHaveBeenCalledOnce();
    expect(runInertiaCertification).toHaveBeenCalledTimes(2);
    expect(createPhysicsTargetSignature((window as any).__containerLoadingPhysicsTarget)).toBe(createPhysicsTargetSignature(saferTarget));
    expect((window as any).__containerLoadingLatestCertification.maxTiltDeg).toBe(0.3);
    expect(openLoadingReport).not.toHaveBeenCalled();
  });

  it.each([[4_000, 3], [12_001, 0]] as const)('automatic final loading of %i boxes compares at most %i alternatives and discloses the cap', async (count, limit) => {
    const placements = Array.from({ length: count }, (_, index) => ({ cargoId: 'A', x: (index % 100) * 0.03, y: (Math.floor(index / 100) % 60) * 0.03,
      z: Math.floor(index / 6000) * 0.03, length: 0.03, width: 0.03, height: 0.03, weightKg: 0.001 }));
    const big: PhysicsTarget = { ...target, cargo: [{ ...target.cargo[0], quantity: count }], result: { ...target.result, placements } };
    vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockResolvedValue({ candidates: [], timedOut: false });
    await act(async () => {
      requestDirectWorkOrder(big.container, big.cargo, big.result, { openReport: false });
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    if (limit === 0) expect(buildDirectResultReoptimizationCandidatesAsync).not.toHaveBeenCalled();
    else expect(vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mock.calls[0][1]).toBe(limit);
    // The baseline is still fully certified and published, with the cap stated on the work order.
    expect(runInertiaCertification).toHaveBeenCalledOnce();
    expect(completeCertificationForWorkOrder).toHaveBeenCalledOnce();
    expect((window as any).__containerLoadingLatestCertification.searchNotice).toContain(`대량 적재(박스 ${count.toLocaleString()}개)`);
    expect(createPhysicsTargetSignature((window as any).__containerLoadingPhysicsTarget)).toBe(createPhysicsTargetSignature(big));
  });

  it('keeps an explicitly selected plan fixed instead of running safer-layout replacement', async () => {
    await act(async () => {
      requestDirectWorkOrder(target.container, target.cargo, target.result, { openReport: false, preserveSelectedPlan: true });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runInertiaCertification).toHaveBeenCalledOnce();
    expect(completeCertificationForWorkOrder).toHaveBeenCalledOnce();
    expect(buildDirectResultReoptimizationCandidatesAsync).not.toHaveBeenCalled();
    expect(buildSecuringPayloadAdjustmentCandidateAsync).not.toHaveBeenCalled();
    expect(createPhysicsTargetSignature((window as any).__containerLoadingPhysicsTarget)).toBe(createPhysicsTargetSignature(target));
    expect((window as any).__containerLoadingLatestCertification.searchNotice).toContain('사용자가 선택한 적재안');
    expect(openLoadingReport).not.toHaveBeenCalled();
  });

  it('closes immediately on cancel without issuing a report', async () => {
    const cancelled = vi.fn();
    window.addEventListener(WORKFLOW_VERIFICATION_CANCELLED_EVENT, cancelled, { once: true });
    await request();
    await click('계산 취소');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(searchSignal?.aborted).toBe(true);
    expect(openLoadingReport).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('aborts the search and closes stale work-order UI when workspace inputs change', async () => {
    await request();
    await act(async () => window.dispatchEvent(new CustomEvent(WORKFLOW_INPUT_INVALIDATED_EVENT)));
    expect(searchSignal?.aborted).toBe(true);
    expect(openLoadingReport).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('rejects a stale verified report after the loading target changes', async () => {
    await request();
    publishPhysicsTarget({ ...target, container: { ...target.container, length: 4 } });
    await click('비교 중단하고 현재 검증 결과로 발급');
    expect(openLoadingReport).not.toHaveBeenCalled();
    expect(host.textContent).toContain('적재안이 변경');
    expect(host.textContent).not.toContain('작업지시서 열기');
  });
});


it('retries a payload failure once with reserved securing mass and never favors its unrun zero-motion metrics', async () => {
  const overload = { ...certification, payloadWithinLimit: false, testedScenarios: 0, passedScenarios: 0, results: {}, maxHorizontalShiftM: 0, maxTiltDeg: 0 };
  const adjustedResult = { ...target.result, placements: [{ ...target.result.placements[0], x: .5 }], remaining: [{ cargoId: 'B', quantity: 1, reason: '보강재 중량 확보' }] };
  const adjustedTarget: PhysicsTarget = { ...target, result: adjustedResult };
  // A completed caution remains preferable to an invalid zero-scenario "zero risk" result.
  const completed = { ...certification, targetSignature: createPhysicsTargetSignature(adjustedTarget) };
  vi.mocked(runInertiaCertification).mockResolvedValueOnce(overload).mockResolvedValueOnce(completed);
  vi.mocked(completeCertificationForWorkOrder).mockResolvedValueOnce(overload).mockResolvedValueOnce(completed);
  vi.mocked(buildSecuringPayloadAdjustmentCandidateAsync).mockResolvedValue({ label: '보강재 예산 확보', target: adjustedTarget, result: adjustedResult, staticPenalty: 0 });
  await request();
  expect(buildSecuringPayloadAdjustmentCandidateAsync).toHaveBeenCalledOnce();
  expect(buildDirectResultReoptimizationCandidatesAsync).not.toHaveBeenCalled();
  expect(runInertiaCertification).toHaveBeenCalledTimes(2);
  expect((window as any).__containerLoadingLatestCertification.payloadWithinLimit).toBe(true);
  expect((window as any).__containerLoadingLatestCertification.testedScenarios).toBe(3);
  expect((window as any).__containerLoadingLatestCertification.searchNotice).toContain('미적재');
  expect(openLoadingReport).toHaveBeenCalledWith(target.container, target.cargo, adjustedResult);
});

it('keeps the failed review result without looping when no payload-adjusted candidate exists', async () => {
  const overload = { ...certification, payloadWithinLimit: false, testedScenarios: 0, passedScenarios: 0, results: {}, maxHorizontalShiftM: 0, maxTiltDeg: 0 };
  vi.mocked(runInertiaCertification).mockResolvedValue(overload);
  vi.mocked(completeCertificationForWorkOrder).mockResolvedValue(overload);
  await request();
  expect(buildSecuringPayloadAdjustmentCandidateAsync).toHaveBeenCalledOnce();
  expect(buildDirectResultReoptimizationCandidatesAsync).not.toHaveBeenCalled();
  expect(runInertiaCertification).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('검증 미완료');
  expect((window as any).__containerLoadingLatestCertification.payloadWithinLimit).toBe(false);
});

it('keeps blocked-popup and ready-report labels failed when inertia PASS has a static hard failure', async () => {
  const invalidTarget: PhysicsTarget = { ...target, result: { ...target.result, operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 초과', placementIndexes: [] }] } };
  const passed: InertiaCertification = { ...certification, status: 'passed', targetSignature: createPhysicsTargetSignature(invalidTarget), passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: .005, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) };
  vi.mocked(runInertiaCertification).mockResolvedValue(passed);
  vi.mocked(completeCertificationForWorkOrder).mockResolvedValue(passed);
  vi.mocked(buildDirectResultReoptimizationCandidatesAsync).mockResolvedValue({ candidates: [], timedOut: false });
  await act(async () => requestDirectWorkOrder(invalidTarget.container, invalidTarget.cargo, invalidTarget.result));
  expect(openLoadingReport).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('검사 완료 · 적재 제약 실패');
  expect(host.textContent).toContain('검증 등급: 적재 제약 실패');
  expect(host.textContent).not.toContain('검증 등급: PASS');
  expect(host.textContent).not.toContain('검사 완료 · PASS');
});
