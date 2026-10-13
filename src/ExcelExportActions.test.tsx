import { fromAPlacement, toAItem } from './engine/loadSimAdapter';
import { workflowWorkInstruction } from './workflowPresentation';
import { buildLoadingReportHtml } from './report';
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


it('keeps fresh level-3 Excel and work-order materials free of uninstalled generic bars', async () => {
  const usage = buildSecuringUsage(base, 3);
  const cert = certification(base, { securing: usage });
  await exportCurrent(base, cert);
  expect(XLSX.writeFile).toHaveBeenCalledOnce();
  const rows = XLSX.utils.sheet_to_json<{ 자재: string }>(workbook().Sheets['보조자재']);
  expect(rows.some(row => row.자재 === '고정바')).toBe(false);
  expect(rows.some(row => row.자재 === '미끄럼방지재')).toBe(true);
  expect(rows.some(row => row.자재 === '블로킹재')).toBe(true);
  const html = buildLoadingReportHtml(base.container, base.cargo, base.result);
  const doc = new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
  expect(doc.querySelector('.materials')?.textContent).not.toContain('고정바');
  expect(doc.querySelector('.materials')?.textContent).toContain('블로킹재');
  expect(html).not.toContain('고정바 포함 최대 결속');
});

it('does not export an old-model generic-bar certification as a current workbook', async () => {
  const old = certification(base, { securing: { ...buildSecuringUsage(base, 3), loadBars: 2 } });
  old.targetSignature = old.targetSignature.replace('restraint-v7-stepped-door-faces', 'restraint-v6-explicit-supports');
  await exportCurrent(base, old);
  expect(XLSX.writeFile).not.toHaveBeenCalled();
});

it('exports the same exact work addresses in direct-box coordinates, LOAD and UNLOAD without phantom range quantities', async () => {
  const placements = [
    { ...base.result.placements[0], x: 0, y: 0, z: 0 },
    { ...base.result.placements[0], x: 0, y: .3, z: 0 },
    { ...base.result.placements[0], x: .3, y: 0, z: 0 },
    { ...base.result.placements[0], x: 0, y: 0, z: .3 },
  ];
  const target: PhysicsTarget = { ...base, cargo: [{ ...base.cargo[0], quantity: 4 }], result: { ...base.result, placements, loadedWeightKg: 4, usedVolumeM3: .108 } };
  const before = JSON.stringify(target);
  await exportCurrent(target, certification(target));
  const book = workbook();
  const detailRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['배치좌표']);
  expect(detailRows.map(row => [row.열, row.행, row.단])).toEqual([[2, 1, 1], [1, 1, 1], [1, 2, 1], [2, 1, 2]]);
  for (const [action, sheet] of [['LOAD', '적재작업순서'], ['UNLOAD', '하역작업순서']] as const) {
    const steps = buildWorkSequence(target.container, target.cargo, target.result, action);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheet]);
    rows.forEach((row, i) => {
      const detail = detailRows[steps[i].placementIndex];
      expect([row.열, row.행, row.단]).toEqual([detail.열, detail.행, detail.단]);
      expect(String(row.작업지시)).toContain(detail.작업위치);
      expect(String(row.작업지시)).not.toMatch(/X |Y |Z |\d\.\d+m/);
    });
  }
  const assembly = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['박스 조립지시']);
  expect(assembly.reduce((sum, row) => sum + Number(row.수량_EA), 0)).toBe(placements.length);
  expect(assembly.flatMap(row => String(row.박스_번호).split(', ').map(Number)).sort()).toEqual([1, 2, 3, 4]);
  for (const row of assembly) expect((Number(row.열_끝) - Number(row.열_시작) + 1) * (Number(row.행_끝) - Number(row.행_시작) + 1)).toBe(row.수량_EA);
  expect(book.SheetNames).toContain('번호 기준');
  expect(JSON.stringify(target)).toBe(before);
});

it.each(['ko', 'en', 'vi'] as const)('keeps vehicle pallet tiers distinct from box assembly tiers in %s Excel', async language => {
  setUiLanguage(language);
  const pallets = [
    { index: 10, stack: 7, tier: 1, y: 0, z: 0 },
    { index: 11, stack: 7, tier: 2, y: 0, z: .45 },
    { index: 20, stack: 9, tier: 1, y: 1.1, z: 0 },
    { index: 21, stack: 9, tier: 2, y: 1.1, z: .75 },
  ].map(p => ({
    palletIndex: p.index, x: 0, y: p.y, z: p.z, stackLevel: p.tier, stackColumn: p.stack,
    length: defaultPalletSpec.length, width: defaultPalletSpec.width, height: defaultPalletSpec.height,
    cargoPlacements: [
      { ...base.result.placements[0], cargoId: '한글 코드', y: p.y, z: p.z + defaultPalletSpec.height },
      { ...base.result.placements[0], cargoId: '한글 코드', y: p.y + .3, z: p.z + defaultPalletSpec.height },
    ],
    cargoWeightKg: 2, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: defaultPalletSpec.tareWeightKg + 2, centerOfGravity: { x: .15, y: p.y + .3, z: p.z + .3 },
  }));
  const snapshot: CertifiedPalletSnapshot = { spec: defaultPalletSpec, result: {
    pallets, placements: pallets.flatMap(p => p.cargoPlacements), remaining: [], palletCount: 4, loadedCargoWeightKg: 8,
    totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 108,
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 2, maxUsedStackLevel: 2,
    optimization: { selectedStackTarget: 2, candidateCount: 1, floorPositions: 2, redistributedForLowUtilization: false, consolidationPasses: 0 },
  } };
  currentWindow.__containerLoadingPalletSnapshot = snapshot;
  const target = physicsTargetFromPalletSnapshot({ ...base.container, width: 2.4, maxPayloadKg: 1000 }, [{ ...base.cargo[0], id: '한글 코드', name: '박스 선택', quantity: 8 }], snapshot);
  const before = JSON.stringify({ target, snapshot });
  await exportCurrent(target, certification(target));
  const book = workbook();
  const boxes = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('팔레트박스구성')]);
  expect(boxes).toHaveLength(8);
  for (const row of boxes) {
    expect(row[uiText('코드')]).toBe('한글 코드');
    expect(row[uiText('품명')]).toBe('박스 선택');
    expect(row[uiText('박스단')]).toBe(1);
    expect(Number(row[uiText('팔레트내Z_m')])).toBeCloseTo(0, 10);
  }
  const palletRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('팔레트별')]);
  expect(palletRows.find(row => row[uiText('팔레트')] === 'P11')).toMatchObject({ [uiText('차량열')]: 2, [uiText('차량행')]: 1, [uiText('팔레트적층단')]: 2, [uiText('적층위치')]: 'C7' });
  expect(palletRows.find(row => row[uiText('팔레트')] === 'P21')).toMatchObject({ [uiText('차량열')]: 1, [uiText('차량행')]: 1, [uiText('팔레트적층단')]: 2, [uiText('적층위치')]: 'C9' });
  const assembly = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('팔레트 조립지시')]);
  expect(assembly.reduce((sum, row) => sum + Number(row[uiText('수량_EA')]), 0)).toBe(8);
  for (const p of pallets) {
    const rows = assembly.filter(row => row[uiText('팔레트')] === `P${p.palletIndex}`);
    expect(rows.reduce((sum, row) => sum + Number(row[uiText('수량_EA')]), 0)).toBe(p.cargoPlacements.length);
    expect(rows.flatMap(row => String(row[uiText('박스_번호')]).split(', ').map(Number)).sort()).toEqual([1, 2]);
    expect(rows.every(row => row[uiText('단')] === 1)).toBe(true);
  }
  if (language !== 'ko') for (const sheet of book.SheetNames) {
    expect(sheet).not.toMatch(/[가-힣]/);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet], { header: 1 });
    expect(rows[0]?.join(' ') ?? '').not.toMatch(/[가-힣]/);
  }
  expect(JSON.stringify({ target, snapshot })).toBe(before);
});

it.each(['ko', 'en', 'vi'] as const)('exports actual six-axis A-rule orientations and placed dimensions in %s assembly rows', async language => {
  setUiLanguage(language);
  const cargo = { ...base.cargo[0], length: .6, width: .4, height: .3, quantity: 2, allowedOrientations: ['LWH', 'LHW'] as ('LWH' | 'LHW')[] };
  const sideways = fromAPlacement({ item: toAItem(cargo, 'sideways'), pos: { x: 0, y: 0, z: 0 }, orientation: 'LHW' }, cargo);
  const upright = fromAPlacement({ item: toAItem(cargo, 'upright'), pos: { x: 0, y: 300, z: 0 }, orientation: 'LWH' }, cargo);
  expect(sideways).toMatchObject({ orientation: 'LHW', rotated: false, length: .6, width: .3, height: .4 });
  const target: PhysicsTarget = { ...base, cargo: [cargo], result: { ...base.result, placements: [sideways, upright], loadedWeightKg: 2, usedVolumeM3: .144 } };
  const before = JSON.stringify(target);
  await exportCurrent(target, certification(target));
  const book = workbook();
  const assembly = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('박스 조립지시')]);
  expect(assembly).toHaveLength(2);
  expect(assembly.find(row => row[uiText('회전')] === 'LHW')).toMatchObject({ [uiText('배치길이_m')]: .6, [uiText('배치폭_m')]: .3, [uiText('배치높이_m')]: .4, [uiText('수량_EA')]: 1 });
  expect(assembly.find(row => row[uiText('회전')] === 'LWH')).toMatchObject({ [uiText('배치길이_m')]: .6, [uiText('배치폭_m')]: .4, [uiText('배치높이_m')]: .3, [uiText('수량_EA')]: 1 });
  const details = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[uiText('배치좌표')]);
  expect(details.map(row => row[uiText('회전')])).toEqual(['LHW', 'LWH']);
  expect(JSON.stringify(target)).toBe(before);
});
