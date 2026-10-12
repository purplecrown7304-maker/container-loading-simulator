import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SafetyInspectionCenter, { openSafetyInspectionCenter } from './SafetyInspectionCenter';
import InspectionStatusPanel from './InspectionStatusPanel';
import CertificationResultSummary from './CertificationResultSummary';
import { runInertiaAnimation } from './engine/inertiaSimulation';
import { runPhysicsValidationSuiteParallel } from './physicsParallel';
import { registerInertiaCanvasHost, clearInertiaCanvasPlayback } from './inertiaCanvasStore';
import InertiaTestTool from './InertiaTestTool';
import InertiaTestLauncher from './InertiaTestLauncher';
import PhysicsValidationTool, { OPEN_PHYSICS_VALIDATION_EVENT } from './PhysicsValidationTool';
import FinalCertificationGate from './FinalCertificationGate';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import FinalWorkOrderOptimizer from './FinalWorkOrderOptimizer';
import SecuringMaterialSettingsPanel from './SecuringMaterialSettingsPanel';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { REQUEST_DIRECT_WORK_ORDER_EVENT } from './directWorkOrderEvents';
import { REQUEST_FINAL_WORK_ORDER_EVENT } from './finalWorkOrderEvents';
import { REQUEST_CERTIFIED_RESULTS_EVENT, buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { setUiLanguage, uiMessage, uiText } from './uiLanguage';
import { stablePhysicsFixture, publishPhysicsFixture, clearPhysicsFixture, withSecuredPhysicsFixture } from './testFixtures/physicsVerification';
import { buildPhysicsReportHtml } from './physicsReport';
import { buildInertiaImprovementReportHtml } from './inertiaReport';
import { assessWorkOrderCertification, isPhysicsTargetVerified } from './inertiaWorkOrderPolicy';
import { inspectionDiagnosticText, inspectionProgressText } from './inspectionPresentation';
import { confirmUnverifiedExport } from './exportVerification';
import { uiMessagesInspection } from './uiMessagesInspection';

vi.mock('./engine/inertiaSimulation', async importOriginal => ({ ...await importOriginal<typeof import('./engine/inertiaSimulation')>(), runInertiaAnimation: vi.fn() }));
vi.mock('./physicsParallel', () => ({ runPhysicsValidationSuiteParallel: vi.fn() }));

const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: '위험-ID', name: '주의 <사용자 이름>', length: .3, width: .3, height: .3, weightKg: 1, quantity: 1 }],
  result: { placements: [{ cargoId: '위험-ID', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] },
};
const empty = { ...target, result: { ...target.result, placements: [] } };
const stable = { scenario: 'acceleration' as const, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .001, maxTiltDeg: .1 };
function certificate() {
  return withSecuredPhysicsFixture(target, {
    status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 3),
    testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .001, maxTiltDeg: .1,
    results: { acceleration: stable, braking: { ...stable, scenario: 'braking' }, cornering: { ...stable, scenario: 'cornering' } },
  } satisfies InertiaCertification);
}
class InspectionWorker {
  static instances: InspectionWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { InspectionWorker.instances.push(this); }
}
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', InspectionWorker);
  InspectionWorker.instances = []; vi.mocked(runInertiaAnimation).mockReset(); vi.mocked(runPhysicsValidationSuiteParallel).mockReset(); clearPhysicsTarget(); clearLatestInertiaCertification(); clearPhysicsFixture(); setUiLanguage('ko');
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
  host = document.createElement('div'); host.innerHTML = '<div id="mount"></div><div class="dashboard-right"></div><div class="loading-options"></div>';
  document.body.append(host); root = createRoot(host.querySelector('#mount')!);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); clearInertiaCanvasPlayback(); clearPhysicsTarget(); clearLatestInertiaCertification(); clearPhysicsFixture(); setUiLanguage('ko'); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const reportBodyText = (html: string) => new DOMParser().parseFromString(html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '', 'text/html').body.textContent;
const noHangul = (text: string | null | undefined) => expect(text ?? '').not.toMatch(/[가-힣]/);

describe('inspection presentation localization', () => {
  it('hot-switches completed worker findings while preserving opaque IDs and canonical data', async () => {
    publishPhysicsTarget(target); const signature = createPhysicsTargetSignature(target); const snapshot = JSON.stringify(target);
    await act(async () => root.render(<SafetyInspectionCenter />));
    await act(async () => openSafetyInspectionCenter('geometry'));
    await act(async () => document.querySelector<HTMLButtonElement>('.safety-center-grid article button')!.click());
    const worker = InspectionWorker.instances[0];
    const finding = { summary: '경계·충돌 문제 1건', details: ['화물 위험-ID가 컨테이너 경계를 침범했습니다.'], caution: '직육면체 배치 기준입니다. 지지율·적층단·누적 상부하중·하역 접근성은 이 항목에서 검사하지 않습니다.', attention: true };
    await act(async () => worker.onmessage?.({ data: { progress: 100, result: finding } }));
    const savedFinding = JSON.stringify(finding);
    for (const language of ['en', 'vi', 'ko'] as const) {
      await act(async () => setUiLanguage(language));
      expect(document.querySelector('#manual-inspection-title')?.textContent).toBe(uiText('경계·충돌 점검'));
      expect(document.querySelector('.manual-inspection-details')?.textContent).toContain('위험-ID');
      expect(document.querySelector('.safety-center-grid article')?.className).toBe('warn');
      if (language !== 'ko') noHangul(document.querySelector('.safety-center-dialog')?.textContent?.replaceAll('위험-ID', ''));
      expect(createPhysicsTargetSignature(readPhysicsTarget()!)).toBe(signature);
      expect(JSON.stringify(target)).toBe(snapshot); expect(JSON.stringify(finding)).toBe(savedFinding);
    }
    expect(InspectionWorker.instances).toHaveLength(1); expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('hot-switches mounted empty-state modals, launchers and material settings', async () => {
    await act(async () => root.render(<><InertiaTestTool /><InertiaTestLauncher /><PhysicsValidationTool /><FinalCertificationGate /><DirectWorkOrderOptimizer /><FinalWorkOrderOptimizer /><SecuringMaterialSettingsPanel /></>));
    await act(async () => {
      window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT));
      window.dispatchEvent(new CustomEvent(REQUEST_CERTIFIED_RESULTS_EVENT, { detail: empty }));
      window.dispatchEvent(new CustomEvent(REQUEST_DIRECT_WORK_ORDER_EVENT, { detail: empty }));
      window.dispatchEvent(new CustomEvent(REQUEST_FINAL_WORK_ORDER_EVENT, { detail: empty }));
    });
    const values = Array.from(document.querySelectorAll<HTMLInputElement>('.securing-material-settings input')).map(input => input.value);
    for (const language of ['en', 'vi', 'ko'] as const) {
      await act(async () => setUiLanguage(language));
      expect(document.querySelector('#inertia-title')?.textContent).toBe(uiText('관성 애니메이션 테스트'));
      expect(document.querySelector('#direct-work-order-title')?.textContent).toBe(uiText('작업지시서 전 상자 안전 후보 비교'));
      if (language !== 'ko') noHangul(document.body.textContent);
      expect(Array.from(document.querySelectorAll<HTMLInputElement>('.securing-material-settings input')).map(input => input.value)).toEqual(values);
    }
    expect(InspectionWorker.instances).toHaveLength(0);
  });

  it('hot-switches completed animation and physics output without restarting either engine', async () => {
    const animation = { ...stable, frames: [{ cargo: new Float32Array([0, 0, 0, 0, 0, 0, 1]), supports: new Float32Array(), phase: 'force' as const, step: 0 }] };
    vi.mocked(runInertiaAnimation).mockResolvedValue(animation);
    const physics = stablePhysicsFixture(target); physics.warningCount = 1; physics.stableCount = 0;
    physics.summary = '운송 종합검증에서 1개 위치가 주의 수준입니다.';
    physics.placements[0] = { ...physics.placements[0], severity: 'warning', reason: '수평 이동 31mm · 기울기 3.1°' };
    vi.mocked(runPhysicsValidationSuiteParallel).mockResolvedValue(physics);
    publishPhysicsTarget(target);
    const canvas = document.createElement('div'); host.append(canvas);
    const unregister = registerInertiaCanvasHost({ element: canvas, ...target });
    try {
      await act(async () => root.render(<><InertiaTestTool /><PhysicsValidationTool /></>));
      await act(async () => { window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT)); });
      const data = JSON.stringify([animation, physics, target]);
      for (const language of ['en', 'vi', 'ko'] as const) {
        await act(async () => setUiLanguage(language));
        expect(document.querySelector('.inertia-timeline')).not.toBeNull();
        expect(document.querySelector('.physics-issue-list')?.textContent).toContain('위험-ID');
        if (language !== 'ko') noHangul(document.body.textContent?.replaceAll('위험-ID', ''));
        expect(JSON.stringify([animation, physics, target])).toBe(data);
      }
      expect(runInertiaAnimation).toHaveBeenCalledTimes(1); expect(runPhysicsValidationSuiteParallel).toHaveBeenCalledTimes(1);
    } finally { await act(async () => unregister()); }
  });

  it('hot-switches reinforcement history and comparison without changing stored certification', async () => {
    publishPhysicsTarget(target); const cert = certificate();
    cert.attempts = [
      { level: 0, levelLabel: buildSecuringUsage(target, 0).levelLabel, payloadWithinLimit: true, passed: false, scenarios: [{ scenario: 'acceleration', passed: false, maxHorizontalShiftM: .05, maxTiltDeg: 5 }] },
      { level: 3, levelLabel: cert.securing.levelLabel, payloadWithinLimit: true, passed: true, scenarios: [{ scenario: 'acceleration', passed: true, maxHorizontalShiftM: .001, maxTiltDeg: .1 }] },
    ];
    const data = JSON.stringify(cert);
    await act(async () => root.render(<CertificationResultSummary detail={{ ...target, certification: cert }} />));
    for (const language of ['en', 'vi', 'ko'] as const) {
      await act(async () => setUiLanguage(language));
      expect(document.querySelector('.certification-result-head strong')?.textContent).toBe('PASS');
      expect(document.querySelectorAll('.certification-attempt-steps > div')).toHaveLength(2);
      if (language !== 'ko') noHangul(host.textContent);
      expect(JSON.stringify(cert)).toBe(data);
    }
  });

  it.each([true, false])('keeps accepted=%s status and signatures unchanged across all locales', async accepted => {
    publishPhysicsTarget(target); publishPhysicsFixture(target); const cert = certificate(); if (!accepted) delete cert.physicsValidation;
    Object.assign(window, { __containerLoadingLatestCertification: cert }); const stored = JSON.stringify(cert); const signature = createPhysicsTargetSignature(target);
    await act(async () => root.render(<InspectionStatusPanel />));
    const classes = Array.from(host.querySelectorAll('tbody tr')).map(row => row.className);
    for (const language of ['en', 'vi', 'ko'] as const) {
      await act(async () => setUiLanguage(language));
      const rows = host.querySelectorAll('tbody tr');
      expect(rows[4].textContent).toContain(uiText(accepted ? '보강 조건부 발급' : '검토용만 가능'));
      expect(Array.from(rows).map(row => row.className)).toEqual(classes);
      if (language !== 'ko') noHangul(host.textContent);
      expect(isPhysicsTargetVerified(target, cert)).toBe(accepted); expect(assessWorkOrderCertification(cert)).toBe('pass');
      expect(JSON.stringify(cert)).toBe(stored); expect(createPhysicsTargetSignature(target)).toBe(signature);
    }
  });

  it.each(['ko', 'en', 'vi'] as const)('generates %s reports with identical data and unchanged user names', language => {
    setUiLanguage(language);
    const physics = stablePhysicsFixture(target); physics.warningCount = 1; physics.stableCount = 0;
    physics.placements[0] = { ...physics.placements[0], severity: 'warning', horizontalShiftM: .031, reason: '수평 이동 31mm · 기울기 3.1°' };
    const snapshot = JSON.stringify([target, physics]);
    const html = buildPhysicsReportHtml(target.container, target.cargo, target.result, physics);
    expect(html).toContain(`lang="${language}"`); expect(html).toContain('위험-ID'); expect(html).toContain('주의 &lt;사용자 이름&gt;'); expect(html).toContain('31 mm');
    const text = reportBodyText(html);
    if (language !== 'ko') noHangul(text?.replaceAll('위험-ID', '').replaceAll('주의 <사용자 이름>', ''));
    expect(JSON.stringify([target, physics])).toBe(snapshot);
    const incomplete = buildInertiaImprovementReportHtml(target, { acceleration: stable })!;
    expect(incomplete).toContain(uiText('검증 미완료 · 남은 시나리오 실행 필요'));
    expect(incomplete).not.toContain(uiText('안정 · 작업지시서 생성 가능'));
    if (language !== 'ko') noHangul(reportBodyText(incomplete));
    const reviewTarget: PhysicsTarget = { ...target, container: { ...target.container, limitReview: { mode: 'what-if', maxPayloadKg: 200 } } };
    const review = buildInertiaImprovementReportHtml(reviewTarget, certificate().results)!;
    expect(review).toContain('WHAT-IF'); expect(review).toContain('class="watermark"');
    expect(review).not.toContain(uiText('최대 이동 {0}, 최대 기울기 {1}로 내부 PASS 범위입니다.', ['1.0 mm', '0.1°']));
  });

  it.each(['ko', 'en', 'vi'] as const)('keeps unverified exports blocked with a %s explanation', language => {
    setUiLanguage(language); const alert = vi.fn(); vi.stubGlobal('alert', alert);
    expect(confirmUnverifiedExport('작업지시서')).toBe(false);
    expect(alert).toHaveBeenCalledWith(uiText('{0} 출력은 현재 차단되어 있습니다.\n\n검증 결과가 없거나 최신 적재안과 일치하지 않습니다. 현재 적재안으로 다시 검사하세요.', [uiText('작업지시서')]));
    if (language !== 'ko') noHangul(alert.mock.calls[0][0]);
  });

  it('translates explicit generated diagnostics without changing inserted names, statuses or numeric limits', () => {
    for (const language of ['en', 'vi'] as const) {
      setUiLanguage(language);
      noHangul(inspectionDiagnosticText('최종 보강 물리검증에서 불안정 화물/지지대 2건이 감지되었습니다. 최종 보강 물리검증에서 잔류 움직임이 감지되었습니다.'));
      noHangul(inspectionDiagnosticText('출발 0.30g · 4.0초 · 최대 수평 이동 15.0 mm · 최대 기울기 1.5°'));
      noHangul(inspectionProgressText('상자 재배치 1/3 · 안정성 우선 · 전체 높이 80%'));
      expect(uiMessage('화물 주의 <사용자 이름>가 컨테이너 경계를 침범했습니다.')).toContain('주의 <사용자 이름>');
      expect(uiMessage('UNKNOWN 이름-ID')).toBe('UNKNOWN 이름-ID');
      for (const message of ['위험-ID: 지지율 55% (기준 80%)', '착지 3 하역 후: 위험-ID: 상부 하중 120kg이 허용 100kg 초과', '길이 방향 무게중심 편차 320mm (허용 ±200mm). 도어 쪽으로 쏠림', '폭 방향 무게중심 편차 130mm (허용 ±100mm). 좌측으로 쏠림']) {
        const translated = inspectionDiagnosticText(message);
        noHangul(translated.replaceAll('위험-ID', ''));
        if (message.includes('위험-ID')) expect(translated).toContain('위험-ID');
      }
      expect(uiText(' · 상대미끄럼 ≤ {0}mm · 팔레트이동 ≤ {1}mm', [12, 15])).toContain('12mm');
    }
    for (const [key, pair] of Object.entries(uiMessagesInspection)) {
      const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
      for (const translated of pair) { noHangul(translated); expect(placeholders(translated)).toEqual(placeholders(key)); }
    }
  });
});
