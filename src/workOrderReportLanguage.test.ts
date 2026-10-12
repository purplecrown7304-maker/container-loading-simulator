import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildPalletLoadingReportHtml, type PalletWorkSnapshot } from './palletWorkerReport';
import { buildLoadingReportHtml } from './report';
import { fieldChecklistGroups } from './reportFieldChecklist';
import { reportSignoff, REPORT_SIGNOFF } from './reportLayout';
import { reportShipmentFields, reportShipmentValues, reportShipmentScript } from './reportShipmentFields';
import { createPhysicsTargetSignature, clearLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { equipmentDisplayText } from './transportEquipmentPresentation';
import { limitReviewRows } from './limitReviewPresentation';
import { assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { setUiLanguage, uiText, type UiLanguage } from './uiLanguage';
import { uiMessagesReports } from './uiMessagesReports';

const container: ContainerSpec = { length: 4.4, width: 2.2, height: 2.6, maxPayloadKg: 5000 };
const cargo: CargoItem[] = [{ id: 'A', name: '<b>제품 A</b>', length: 0.5, width: 0.5, height: 0.4, weightKg: 10, quantity: 4 }];

const snapshot: PalletWorkSnapshot = {
  spec: {
    length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxLoadKg: 1000,
    maxStackLevels: 2, maxSupportedTopWeightKg: 1000, useCornerGuards: false,
    cornerGuardWeightKg: 2, cornerGuardExtraHeightM: 0.03, useWrapping: false,
    wrappingWeightKg: 1.5, wrappingExtraHeightM: 0.01, minimizePackaging: true,
  },
  result: {
    pallets: [
      {
        palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1,
        length: 1.1, width: 1.1, height: 0.15,
        cargoPlacements: [
          { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
          { cargoId: 'A', x: 0.5, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
        ],
        cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
        cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
        centerOfGravity: { x: 0.5, y: 0.25, z: 0.3 },
      },
      {
        palletIndex: 2, x: 0, y: 0, z: 0.55, stackLevel: 2, stackColumn: 1,
        length: 1.1, width: 1.1, height: 0.15,
        cargoPlacements: [
          { cargoId: 'A', x: 0, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
          { cargoId: 'A', x: 0.5, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
        ],
        cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
        cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
        centerOfGravity: { x: 0.5, y: 0.25, z: 0.85 },
      },
    ],
    placements: [
      { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0.5, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0.5, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
    ],
    remaining: [], palletCount: 2, loadedCargoWeightKg: 40, totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 90,
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 1, maxUsedStackLevel: 2,
    optimization: { selectedStackTarget: 2, candidateCount: 2, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
  },
};

const certification: InertiaCertification = {
  status: 'passed', mode: 'pallets', targetSignature: 'test', testedAt: '2026-08-25T00:00:00Z',
  securing: {
    level: 2, levelLabel: '2차 보강 · 밴딩+각대+랩핑', palletCount: 2, palletWeightKg: 50,
    bandingStraps: 6, bandingLengthM: 18, cornerGuards: 8, cornerGuardLengthM: 3.2,
    wrappingLengthM: 28, antiSlipMats: 2, dunnageBlocks: 0, loadBars: 0,
    estimatedAddedWeightKg: 2.1, estimatedNonCargoWeightKg: 52.1,
  },
  testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: 0.006,
  maxCargoRelativeSlipM: 0.003, maxSupportShiftM: 0.004, maxTiltDeg: 0.9,
  maxCargoRestraintForceN: 2400, maxSupportRestraintForceN: 0,
  results: {}, payloadWithinLimit: true,
  attempts: [
    { level: 0, levelLabel: '보조 고정 없음', payloadWithinLimit: true, passed: false, scenarios: [{ scenario: 'braking', passed: false, maxHorizontalShiftM: 0.02, maxCargoRelativeSlipM: 0.014, maxSupportShiftM: 0.013, maxTiltDeg: 2.4 }] },
    { level: 2, levelLabel: '2차 보강 · 밴딩+각대+랩핑', payloadWithinLimit: true, passed: true, scenarios: [
      { scenario: 'acceleration', passed: true, maxHorizontalShiftM: 0.005, maxCargoRelativeSlipM: 0.002, maxSupportShiftM: 0.003, maxTiltDeg: 0.7 },
      { scenario: 'braking', passed: true, maxHorizontalShiftM: 0.006, maxCargoRelativeSlipM: 0.003, maxSupportShiftM: 0.004, maxTiltDeg: 0.9 },
      { scenario: 'cornering', passed: true, maxHorizontalShiftM: 0.004, maxCargoRelativeSlipM: 0.002, maxSupportShiftM: 0.003, maxTiltDeg: 0.6 },
    ] },
  ],
};


const locales = { ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' } as const;
const expected = {
  ko: { title: '팔레트 적재 작업지시서', field: '현장 작업 체크리스트', floor: '바닥', operator: '작업 담당', missing: '미입력', warning: '실제 운송 안전 인증을 의미하지 않습니다', incomplete: '검증 미완료', carton: '컨테이너 통합 출하·적재 작업지시서' },
  en: { title: 'Pallet loading work order', field: 'Field work checklist', floor: 'Floor', operator: 'Operator', missing: 'Not entered', warning: 'not transport safety certification', incomplete: 'Verification incomplete', carton: 'Container shipment and loading work order' },
  vi: { title: 'Lệnh xếp hàng pallet', field: 'Danh sách kiểm tra hiện trường', floor: 'Sàn', operator: 'Người thao tác', missing: 'Chưa nhập', warning: 'không phải chứng nhận an toàn vận chuyển', incomplete: 'Chưa hoàn tất kiểm tra', carton: 'Lệnh xuất và xếp hàng Container' },
} as const;

beforeEach(() => { setUiLanguage('ko'); clearLatestInertiaCertification(); clearPhysicsTarget(); });
afterEach(() => { setUiLanguage('ko'); clearLatestInertiaCertification(); clearPhysicsTarget(); vi.restoreAllMocks(); });

it('integrates every report key and keeps the exact parameter contract in both translations', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, values] of Object.entries(uiMessagesReports)) {
    for (const [i, translated] of values.entries()) {
      expect(translated.trim(), key).not.toBe('');
      expect(placeholders(translated), key).toEqual(placeholders(key));
      expect(uiText(key, [], i === 0 ? 'en' : 'vi'), key).not.toBe(key);
      expect(placeholders(uiText(key, [], i === 0 ? 'en' : 'vi')), key).toEqual(placeholders(key));
    }
  }
});

describe.each<UiLanguage>(['ko', 'en', 'vi'])('work-order generation in %s', language => {
  it('uses the current locale after module import, including HTML/SVG, dates, signoff and safety disclaimers', () => {
    setUiLanguage(language);
    const date = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('DATE_FOR_REPORT');
    const html = buildPalletLoadingReportHtml(container, cargo, snapshot, certification);
    const doc = new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
    expect(doc.documentElement.lang).toBe(language);
    expect(doc.title).toBe(expected[language].title);
    expect([...doc.querySelectorAll('.report-signoff')].at(-1)?.textContent).toContain(expected[language].operator);
    expect(doc.querySelector('[data-field-checklist]')?.textContent).toContain('HT');
    expect(doc.body.textContent).toContain(expected[language].field);
    expect(doc.body.textContent).toContain(expected[language].warning);
    expect(html).toContain('0.30g'); expect(html).toContain('0.50g'); expect(html).toContain('0.35g');
    expect(html).toContain('14.0mm'); expect(html).toContain('13.0mm'); expect(html).toContain('2.4 kN');
    expect(html).toContain('&lt;b&gt;제품 A&lt;/b&gt;');
    expect(html).not.toContain('<b>제품 A</b>');
    expect(date).toHaveBeenCalledWith(locales[language]);
    if (language !== 'ko') {
      expect(doc.querySelectorAll('svg')[0].getAttribute('aria-label')).not.toMatch(/[가-힣]/);
      expect(doc.querySelector('.sequence')?.textContent).not.toMatch(/[가-힣]/);
      expect([...doc.querySelectorAll('.report-signoff')].at(-1)?.textContent).not.toMatch(/[가-힣]/);
    }
  });

  it('keeps user IDs/names opaque, leaves unverified output unapproved, and does not alter results or certification signatures', () => {
    const userCargo: CargoItem[] = [{ ...cargo[0], id: '팔레트', name: '현장 기록 <script>공급사</script>' }];
    const result: LoadingResult = { placements: [{ ...snapshot.result.placements[0], cargoId: '팔레트', z: 0 }], remaining: [{ cargoId: '팔레트', quantity: 3, reason: '사용자 설명' }], loadedWeightKg: 10, usedVolumeM3: 0.1, validationIssues: [] };
    const target: PhysicsTarget = { mode: 'boxes', container, cargo: userCargo, result };
    const signature = createPhysicsTargetSignature(target);
    const saved = JSON.stringify(target);
    const verdict = assessWorkOrderCertification(certification);
    setUiLanguage(language);
    const html = buildLoadingReportHtml(container, userCargo, result);
    const doc = new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
    expect(doc.title).toBe(expected[language].carton);
    expect(doc.querySelector('.report-status')?.textContent).toContain(uiText(' · 검증 미완료'));
    expect(doc.querySelector('.watermark')).not.toBeNull();
    expect(doc.querySelector('.report-status')?.classList.contains('neutral')).toBe(true);
    expect(doc.querySelector('.zone-legend')?.textContent).toContain('팔레트');
    expect(doc.querySelector('.zone-legend')?.textContent).toContain('현장 기록 <script>공급사</script>');
    expect(html).toContain('&lt;script&gt;공급사&lt;/script&gt;');
    expect(html).not.toContain('<script>공급사</script>');
    expect(JSON.stringify(target)).toBe(saved);
    expect(createPhysicsTargetSignature(target)).toBe(signature);
    expect(assessWorkOrderCertification(certification)).toBe(verdict);
  });

  it('keeps hard failures dangerous and numerical review explicitly unapproved in every language', () => {
    setUiLanguage(language);
    const result: LoadingResult = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [{ type: 'PAYLOAD', message: '실물 한도 초과 <b>25</b>', placementIndexes: [] }] };
    const dangerous = new DOMParser().parseFromString(buildLoadingReportHtml(container, cargo, result).replace(/<link\b[^>]*>/g, ''), 'text/html');
    expect(dangerous.querySelector('.report-status')?.classList.contains('danger')).toBe(true);
    expect(dangerous.body.textContent).toContain(uiText('적재 제약 위반이 있어 출고할 수 없습니다. 이 문서는 검토용입니다.'));
    expect(dangerous.body.textContent).toContain('실물 한도 초과 <b>25</b>');
    expect(dangerous.body.innerHTML).not.toContain('<b>25</b>');
    const reviewContainer: ContainerSpec = { ...container, limitReview: { mode: 'what-if', maxPayloadKg: 6000, cargoLimits: { '최대값': { maxStackLayers: 3 } } } };
    const reviewCargo = [{ ...cargo[0], id: '최대값', maxStackLayers: 2 }];
    const reviewResult = { ...result, validationIssues: [] };
    const reviewTarget = { container: reviewContainer, cargo: reviewCargo, result: reviewResult };
    setUiLanguage('ko');
    const originalRows = limitReviewRows(reviewTarget);
    setUiLanguage(language);
    const review = new DOMParser().parseFromString(buildLoadingReportHtml(reviewContainer, reviewCargo, reviewResult).replace(/<link\b[^>]*>/g, ''), 'text/html');
    expect(review.querySelector('.watermark')?.textContent).toBe(uiText('WHAT-IF REVIEW · 출고 승인 아님'));
    expect(review.querySelector('.report-status')?.classList.contains('good')).toBe(false);
    expect(review.querySelector('.limit-review-warning')).not.toBeNull();
    expect(limitReviewRows(reviewTarget)).toEqual(originalRows);
    expect(originalRows[0]).toMatchObject({ 원래한도: 5000, 시나리오한도: 6000, 실제값: 0 });
    expect(review.querySelectorAll('.report-table-scroll tbody tr')[1]?.children[2]?.textContent).toBe('최대값');
    if (language !== 'ko') {
      expect(review.querySelector('.limit-review-warning')?.textContent).not.toMatch(/[가-힣]/);
      expect(review.querySelector('.report-table-scroll thead')?.textContent).not.toMatch(/[가-힣]/);
    }
    expect(reviewContainer.maxPayloadKg).toBe(5000);
    expect(reviewContainer.limitReview?.maxPayloadKg).toBe(6000);
  });

  it('localizes composed WHAT-IF verdicts without weakening their danger state', () => {
    setUiLanguage(language);
    const reviewContainer: ContainerSpec = { ...container, limitReview: { mode: 'what-if', maxPayloadKg: 6000 } };
    const failedCertification: InertiaCertification = { ...certification, status: 'failed', maxHorizontalShiftM: 0.5, maxTiltDeg: 30 };
    const html = buildPalletLoadingReportHtml(reviewContainer, cargo, snapshot, failedCertification);
    const doc = new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
    expect(doc.querySelector('.report-status')?.classList.contains('danger')).toBe(true);
    expect(doc.querySelector('.report-status')?.textContent).toContain('WHAT-IF REVIEW');
    expect(doc.querySelector('.watermark')?.textContent).toBe(uiText('WHAT-IF REVIEW · 출고 승인 아님'));
    if (language !== 'ko') expect(doc.querySelector('.report-status')?.textContent).not.toMatch(/[가-힣]/);
    expect(failedCertification.maxHorizontalShiftM).toBe(0.5);
    expect(failedCertification.maxTiltDeg).toBe(30);
  });

  it('translates built-in truck labels and provenance but preserves custom equipment text', () => {
    const previous = readTransportEquipment();
    const truck = getTransportEquipment('kr-1t-box')!;
    const result: LoadingResult = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
    setUiLanguage(language);
    try {
      selectTransportEquipment(truck);
      const saved = JSON.stringify(readTransportEquipment());
      const builtin = new DOMParser().parseFromString(buildLoadingReportHtml(truck, cargo, result).replace(/<link\b[^>]*>/g, ''), 'text/html');
      expect(builtin.querySelector('.summary')?.textContent).toContain(equipmentDisplayText(truck, 'shortName'));
      expect(builtin.querySelector('.footer')?.textContent).toContain(equipmentDisplayText(truck, 'shortName'));
      expect(builtin.querySelector('aside.technical-note')?.textContent).toContain(equipmentDisplayText(truck, 'sourceLabel'));
      expect(JSON.stringify(readTransportEquipment())).toBe(saved);
      if (language !== 'ko') {
        expect(equipmentDisplayText(truck, 'shortName')).not.toMatch(/[가-힣]/);
        expect(equipmentDisplayText(truck, 'sourceLabel')).not.toMatch(/[가-힣]/);
        expect(builtin.body.textContent).not.toContain(truck.shortName);
        expect(builtin.body.textContent).not.toContain(truck.sourceLabel);
      }
      const custom = { ...truck, shortName: '작업 담당', sourceLabel: '확인 필요 <img src=x onerror=alert(1)>' };
      selectTransportEquipment(custom);
      const customSaved = JSON.stringify(readTransportEquipment());
      const html = buildLoadingReportHtml(custom, cargo, result);
      const customDoc = new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
      expect(customDoc.querySelector('.summary')?.textContent).toContain(custom.shortName);
      expect(customDoc.querySelector('.footer')?.textContent).toContain(custom.shortName);
      expect(customDoc.querySelector('aside.technical-note')?.textContent).toContain(custom.sourceLabel);
      expect(customDoc.querySelector('aside.technical-note img')).toBeNull();
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(JSON.stringify(readTransportEquipment())).toBe(customSaved);
    } finally { selectTransportEquipment(previous); }
  });

  it('localizes interactive print fields while preserving arbitrary typed values through textContent', () => {
    setUiLanguage(language);
    document.body.innerHTML = reportShipmentFields() + reportShipmentValues() + '<button data-report-print>Print</button>';
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });
    const confirm = vi.fn<(message: string) => boolean>().mockReturnValue(false);
    Object.defineProperty(window, 'confirm', { value: confirm, configurable: true });
    const script = reportShipmentScript().replace(/^<script>|<\/script>$/g, '');
    new Function(script)();
    const input = document.querySelector<HTMLInputElement>('[data-shipment-input="customer"]')!;
    input.value = '거래처 <img src=x onerror=alert(1)>';
    input.dispatchEvent(new Event('input'));
    const output = document.querySelector('[data-shipment-value="customer"]')!;
    expect(output.textContent).toBe(input.value);
    expect(output.querySelector('img')).toBeNull();
    expect(document.querySelector('[data-shipment-value="destination"]')?.textContent).toBe(uiText('미입력'));
    document.querySelector<HTMLButtonElement>('[data-report-print]')!.click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(print).not.toHaveBeenCalled();
    if (language !== 'ko') expect(confirm.mock.calls[0][0]).not.toMatch(/[가-힣]/);
    for (const field of document.querySelectorAll<HTMLInputElement>('[data-shipment-input]')) field.value = '거래처';
    document.querySelector<HTMLButtonElement>('[data-report-print]')!.click();
    expect(print).toHaveBeenCalledOnce();
  });

  it('preserves field-checklist branch logic and blank signoffs', () => {
    setUiLanguage(language);
    const containerGroups = fieldChecklistGroups('container', { pallet: true });
    const truckGroups = fieldChecklistGroups('truck');
    expect(containerGroups).toHaveLength(3); expect(truckGroups).toHaveLength(3);
    expect(containerGroups.flatMap(group => group.items).join(' ')).toContain('VGM');
    expect(containerGroups.flatMap(group => group.items).join(' ')).toContain('HT');
    expect(truckGroups.flatMap(group => group.items).join(' ')).not.toContain('VGM');
    expect(truckGroups.flatMap(group => group.items).join(' ')).not.toContain('HT');
    expect(reportSignoff()).toContain(expected[language].operator);
    expect(reportSignoff()).not.toMatch(/☑|✓/);
    if (language === 'ko') expect(reportSignoff()).toBe(REPORT_SIGNOFF);
  });
});
