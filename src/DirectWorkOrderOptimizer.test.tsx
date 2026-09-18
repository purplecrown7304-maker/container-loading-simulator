import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { buildDirectResultReoptimizationCandidatesAsync } from './engine/finalResultOptimization';
import { buildSecuringUsage, createPhysicsTargetSignature, runInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { completeCertificationForWorkOrder } from './inertiaWorkOrderPolicy';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';

vi.mock('./engine/finalResultOptimization', async importOriginal => ({ ...await importOriginal<object>(), buildDirectResultReoptimizationCandidatesAsync: vi.fn() }));
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

  it('closes immediately on cancel without issuing a report', async () => {
    await request();
    await click('계산 취소');
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
