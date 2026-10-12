import { workflowWorkInstruction } from './workflowPresentation';
import { buildWorkSequence } from './engine/workSequence';
import { setUiLanguage, uiText } from './uiLanguage';
import { LIMIT_REVIEW_WARNING, LIMIT_REVIEW_PROVENANCE } from './limitReviewPresentation';
import { withSecuredPhysicsFixture } from './testFixtures/physicsVerification';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelExportActions from './ExcelExportActions';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { physicsTargetFromPalletSnapshot, type CertifiedPalletSnapshot } from './certifiedExport';
import { defaultPalletSpec } from './engine/palletOptimization';

vi.mock('xlsx', async importOriginal => ({ ...await importOriginal<object>(), writeFile: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
const currentWindow = window as Window & { __containerLoadingLatestResult?: PhysicsTarget; __containerLoadingLatestCertification?: InertiaCertification; __containerLoadingPalletSnapshot?: CertifiedPalletSnapshot };
const base: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: .3, width: .3, height: .3, weightKg: 1, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] },
};
function certification(target: PhysicsTarget, overrides: Partial<InertiaCertification> = {}): InertiaCertification {
  const cert: InertiaCertification = { status: 'passed', mode: target.mode, targetSignature: createPhysicsTargetSignature(target), testedAt: new Date(0).toISOString(),
    securing: buildSecuringUsage(target, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: .005, maxTiltDeg: .5, payloadWithinLimit: true,
    results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])), ...overrides };
  return cert.payloadWithinLimit && cert.testedScenarios === 3 ? withSecuredPhysicsFixture(target, cert) : cert;
}
beforeEach(() => {
  setUiLanguage('ko');
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('alert', vi.fn());
  host = document.createElement('div'); host.innerHTML = '<div class="quick-row"></div><div class="mount"></div>'; document.body.append(host); root = createRoot(host.querySelector('.mount')!);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); clearLatestInertiaCertification(); clearPhysicsTarget();
  delete currentWindow.__containerLoadingLatestResult; delete currentWindow.__containerLoadingPalletSnapshot; setUiLanguage('ko'); vi.unstubAllGlobals();
});
async function exportCurrent(target: PhysicsTarget, cert: InertiaCertification) {
  currentWindow.__containerLoadingLatestResult = target;
  publishPhysicsTarget(target); currentWindow.__containerLoadingLatestCertification = cert;
  await act(async () => root.render(<ExcelExportActions />));
  await act(async () => host.querySelector<HTMLButtonElement>('.excel-export-runtime')!.click());
}
function workbook() { return vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0]; }
function summary() { return XLSX.utils.sheet_to_json<unknown[]>(workbook().Sheets['요약'], { header: 1 }); }

it('exports a current payload failure as an explicitly marked review workbook without any final PASS', async () => {
  await exportCurrent(base, certification(base, { status: 'failed', payloadWithinLimit: false, results: {}, testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'] }));
  expect(XLSX.writeFile).toHaveBeenCalledOnce();
  expect(summary()).toContainEqual(['문서 용도', '검토용 · 출고 승인 아님']);
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).not.toContain('PASS');
  const metrics = XLSX.utils.sheet_to_json<{ 판정: string; 문서용도: string }>(workbook().Sheets['관성안전지표'])[0];
  expect(metrics.판정).toBe('위험'); expect(metrics.문서용도).toContain('검토용');
});

it('does not print PASS for operational errors even if inertia status says passed', async () => {
  const target: PhysicsTarget = { ...base, result: { ...base.result, operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 범위 초과', placementIndexes: [] }] } };
  await exportCurrent(target, certification(target));
  expect(summary()).toContainEqual(['문서 용도', '검토용 · 출고 승인 아님']);
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).toContain('적재 제약 실패');
  expect(XLSX.utils.sheet_to_json<{ 판정: string }>(workbook().Sheets['관성안전지표'])[0].판정).toBe('적재 제약 실패');
});

it('exports a genuine PASS without a review-purpose label', async () => {
  await exportCurrent(base, certification(base));
  expect(summary()).toContainEqual(['문서 용도', '검증 결과']);
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).toContain('PASS');
});

it('blocks stale workbook identity', async () => {
  await exportCurrent(base, certification(base, { targetSignature: 'obsolete' }));
  expect(XLSX.writeFile).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledOnce();
});

it('exports a pallet failure with matching snapshot as review data, without a literal PASS summary', async () => {
  const placement = { ...base.result.placements[0], z: defaultPalletSpec.height };
  const palletWeight = defaultPalletSpec.tareWeightKg + 1;
  const snapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: {
    pallets: [{ palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1, length: defaultPalletSpec.length, width: defaultPalletSpec.width, height: defaultPalletSpec.height, cargoPlacements: [placement], cargoWeightKg: 1, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: palletWeight, centerOfGravity: { x: .15, y: .15, z: .3 } }],
    placements: [placement], remaining: [], palletCount: 1, loadedCargoWeightKg: 1, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: palletWeight, consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
    optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
  } };
  currentWindow.__containerLoadingPalletSnapshot = snapshot;
  const target = physicsTargetFromPalletSnapshot(base.container, base.cargo, snapshot);
  await exportCurrent(target, certification(target, { status: 'failed', payloadWithinLimit: false, results: {}, testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'] }));
  expect(XLSX.writeFile).toHaveBeenCalledOnce();
  expect(summary()).toContainEqual(['문서 용도', '검토용 · 출고 승인 아님']);
  expect(summary().find(row => row[0] === '관성검증')?.[1]).not.toContain('PASS');
});


it('labels a completed caution result as review-only rather than approval', async () => {
  const cert = certification(base, { status: 'failed', passedScenarios: 1, failedScenarios: ['acceleration', 'braking'], maxHorizontalShiftM: .02 });
  cert.results.acceleration!.maxHorizontalShiftM = .02;
  cert.results.braking!.maxHorizontalShiftM = .02;
  await exportCurrent(base, cert);
  expect(XLSX.writeFile).toHaveBeenCalledOnce();
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).toContain('주의 · 검토용');
  expect(XLSX.utils.sheet_to_json<{ 판정: string }>(workbook().Sheets['관성안전지표'])[0].판정).toBe('주의 · 검토용');
  expect(JSON.stringify(summary())).not.toContain('주의 승인');
});

it('marks every workbook sheet WHAT-IF even when baseline physics is healthy', async () => {
  const target: PhysicsTarget = { ...base, container: { ...base.container, limitReview: { mode: 'what-if', maxPayloadKg: 200, simulation: { maxDisplacementMm: 30, maxRotationDeg: 5 } } } };
  await exportCurrent(target, certification(target));
  const wb = workbook();
  expect(wb.SheetNames).toContain('WHAT-IF 한도비교');
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1 });
    expect(rows[0][0]).toContain('WHAT-IF REVIEW');
    expect(rows[0][0]).toContain('출고 승인');
    expect(rows[1][0]).toContain('카탈로그 대표값');
  }
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).toContain('WHAT-IF REVIEW');
  expect(summary().find(row => row[0] === '최종 관성검증')?.[1]).not.toContain('PASS');
});


it('exports structured void-fill location material quantity and weight', async () => {
  const target: PhysicsTarget = {
    ...base,
    result: {
      ...base.result,
      voidFillPlan: {
        fills: [{
          id: 'fill-door-face', kind: 'door-face', material: 'load-bar', quantity: 2, weightKg: 10.2,
          fixedSupportEligible: true, gapM: 1.2, voidVolumeM3: 1.8,
          x: .3, y: 0, z: 0, length: .03, width: 2, height: .9,
        }],
        sideGapM: 0, rearGapM: 1.2, volumeM3: 1.8, weightKg: 10.2, unresolvedCount: 0,
      },
    },
  };
  await exportCurrent(target, certification(target));
  expect(workbook().SheetNames).toContain('메움재상세');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook().Sheets['메움재상세']);
  expect(rows[0]).toMatchObject({
    ID: 'fill-door-face',
    틈유형: '문쪽 끝단',
    자재: '카고 로드바',
    수량_EA: 2,
    중량_kg: 10.2,
    X_m: .3,
    관성고정지지: 'Y',
  });
  expect(summary()).toContainEqual(['메움재 중량(kg)', 10.2]);
});


it.each(['en', 'vi'] as const)('exports %s headers and safety purpose while preserving Korean cargo data', async language => {
  setUiLanguage(language);
  const target: PhysicsTarget = { ...base, cargo: [{ ...base.cargo[0], id: '한글 코드', name: '박스 선택' }], result: { ...base.result, placements: [{ ...base.result.placements[0], cargoId: '한글 코드', rotated: true }] } };
  const input = JSON.stringify(target);
  await exportCurrent(target, certification(target, { status: 'failed', payloadWithinLimit: false, results: {}, testedScenarios: 0, passedScenarios: 0, failedScenarios: ['acceleration', 'braking', 'cornering'] }));
  const book = workbook();
  const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[uiText('요약')], { header: 1 });
  expect(summaryRows).toContainEqual([uiText('문서 용도'), uiText('검토용 · 출고 승인 아님')]);
  const cargoRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('품목별')]);
  expect(cargoRows[0][uiText('코드')]).toBe('한글 코드');
  expect(cargoRows[0][uiText('품명')]).toBe('박스 선택');
  const placementRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('배치좌표')]);
  expect(placementRows[0][uiText('회전')]).toBe('90°');
  for (const sheetName of book.SheetNames) {
    expect(sheetName).not.toMatch(/[가-힣]/);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1 });
    if (rows.length) expect(rows[0].join(' ')).not.toMatch(/[가-힣]/);
  }
  for (const [action, sheet] of [['LOAD', '적재작업순서'], ['UNLOAD', '하역작업순서']] as const) {
    const steps = buildWorkSequence(target.container, target.cargo, target.result, action);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText(sheet)]);
    expect(rows).toHaveLength(1);
    const instruction = String(rows[0][uiText('작업지시')]);
    expect(instruction).toBe(workflowWorkInstruction(steps[0]));
    expect(instruction).toContain('한글 코드');
    expect(instruction).toContain(uiText(action === 'LOAD' ? '적재' : '하역'));
    expect(instruction.replaceAll('한글 코드', '')).not.toMatch(/[가-힣]/);
    expect(rows[0][uiText('품명')]).toBe('박스 선택');
  }
  expect(JSON.stringify(target)).toBe(input);
});

it.each(['en', 'vi'] as const)('keeps permanent WHAT-IF warnings on every %s sheet', async language => {
  setUiLanguage(language);
  const target: PhysicsTarget = { ...base, container: { ...base.container, limitReview: { mode: 'what-if', maxPayloadKg: 200 } } };
  await exportCurrent(target, certification(target));
  const book = workbook();
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1 });
    expect(rows[0][0]).toBe(uiText(LIMIT_REVIEW_WARNING));
    expect(rows[1][0]).toBe(uiText(LIMIT_REVIEW_PROVENANCE));
    expect(String(rows[0][0])).not.toMatch(/[가-힣]/);
  }
  const comparison = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[uiText('WHAT-IF 한도비교')], { header: 1 });
  expect(JSON.stringify(comparison)).not.toMatch(/[가-힣]/);
});
