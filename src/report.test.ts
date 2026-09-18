import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLoadingReportHtml, openLoadingReport } from './report';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { REQUEST_DIRECT_WORK_ORDER_EVENT } from './directWorkOrderEvents';

afterEach(() => { vi.restoreAllMocks(); clearLatestInertiaCertification(); clearPhysicsTarget(); });

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const cargo: CargoItem[] = [{ id: 'BOX-A', name: '<b>BOX A</b>', length: 0.6, width: 0.4, height: 0.35, weightKg: 18, quantity: 2, maxStackLayers: 7, maxTopLoadKg: 100 }];
const result: LoadingResult = {
  placements: [{ cargoId: 'BOX-A', x: 0, y: 0, z: 0, length: 0.6, width: 0.4, height: 0.35, weightKg: 18 }],
  remaining: [{ cargoId: 'BOX-A', quantity: 1, reason: '<script>alert(1)</script>' }],
  loadedWeightKg: 18,
  usedVolumeM3: 0.084,
  validationIssues: [],
};

describe('loading work order', () => {
  it('opens a completed danger report without recursively requesting optimization', () => {
    const target: PhysicsTarget = { mode: 'boxes', container, cargo, result };
    publishPhysicsTarget(target);
    const certification: InertiaCertification = {
      status: 'failed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: new Date().toISOString(),
      securing: buildSecuringUsage(target, 3), testedScenarios: 3, passedScenarios: 0,
      failedScenarios: ['acceleration', 'braking', 'cornering'], maxHorizontalShiftM: 0.1, maxTiltDeg: 10,
      payloadWithinLimit: true, results: {}, searchNotice: '추가 후보 비교 시간 제한',
    };
    for (const scenario of certification.failedScenarios) certification.results[scenario] = { scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: 0.1, maxTiltDeg: 10 };
    (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = certification;
    const recursiveRequest = vi.fn();
    window.addEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, recursiveRequest);
    const popup = { opener: null, document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      expect(openLoadingReport(container, cargo, result)).toBe(true);
      expect(recursiveRequest).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
      expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('위험 기준을 초과'));
      expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('추가 후보 비교 시간 제한'));
    } finally { window.removeEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, recursiveRequest); }
  });
  it('renders only worker essentials with visual loading guides', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).toContain('컨테이너 통합 출하·적재 작업지시서');
    expect(html).toContain('위에서 본 적재도');
    expect(html).toContain('옆에서 본 적재도');
    expect(html).toContain('3단계 진행 그림');
    expect(html).toContain('작업 순서');
    expect(html).toContain('필요 보조자재');
    expect(html).toContain('도어 닫힘 간섭 없음');
    expect(html).toContain('안쪽부터');
    expect(html).toContain('바닥부터');
  });

  it('removes engineering-detail tables from the worker sheet', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).not.toContain('바닥 하중 격자 (12×4)');
    expect(html).not.toContain('자동 보정 이력');
    expect(html).not.toContain('품목별 배치 사유');
    expect(html).not.toContain('제약조건 검사');
  });

  it('escapes cargo labels and remaining cargo summary', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).toContain('BOX-A');
    expect(html).toContain('&lt;b&gt;BOX A&lt;/b&gt;');
    expect(html).not.toContain('<b>BOX A</b>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
