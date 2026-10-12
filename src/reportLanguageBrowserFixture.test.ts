import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CargoItem, ContainerSpec } from './engine/types';
import { clearLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { buildPalletLoadingReportHtml, type PalletWorkSnapshot } from './palletWorkerReport';
import { clearPhysicsTarget } from './physicsTarget';
import { buildLoadingReportHtml } from './report';
import { reportFixture } from './reportZones.fixture';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { setUiLanguage } from './uiLanguage';

// Fast DOM/script preflight for e2e/report-language.spec.ts. Chromium remains the
// authority for native dialogs, CSS layout and print-media visibility.
const copy = {
  en: {
    title: 'Container shipment and loading work order', palletTitle: 'Pallet loading work order',
    layout: 'Loading layout at a glance', checklist: 'Field work checklist',
    final: 'Final checks before dispatch', print: 'Print / Save PDF',
    fields: ['Customer', 'Destination', 'Vehicle/Container No.', 'Planned dispatch'],
    missing: 'Unspecified', missingPrefix: 'Missing shipment information: ',
    missingQuestion: '\nPrint with missing-field labels?',
    complete: 'Shipment information complete · Check the details before printing.',
    incomplete: 'Validation incomplete', review: 'For review · Verification required',
    whatIf: 'WHAT-IF REVIEW · Not dispatch approval',
    disclaimer: 'not transport safety certification',
  },
  vi: {
    title: 'Lệnh xuất và xếp hàng Container', palletTitle: 'Lệnh xếp hàng pallet',
    layout: 'Tổng quan bố trí xếp hàng', checklist: 'Danh sách kiểm tra hiện trường',
    final: 'Kiểm tra cuối trước khi xuất hàng', print: 'In / Lưu PDF',
    fields: ['Khách hàng', 'Điểm đến', 'Số xe/container', 'Dự kiến xuất hàng'],
    missing: 'Chưa nhập', missingPrefix: 'Thiếu thông tin xuất hàng: ',
    missingQuestion: '\nIn kèm nhãn mục chưa nhập?',
    complete: 'Đã nhập đủ thông tin xuất hàng · Kiểm tra nội dung trước khi in.',
    incomplete: 'Kiểm chứng chưa hoàn tất', review: 'Để xem xét · Cần kiểm tra xác nhận',
    whatIf: 'WHAT-IF REVIEW · Không phải phê duyệt xuất hàng',
    disclaimer: 'không phải chứng nhận an toàn vận chuyển',
  },
} as const;
const cargoName = '한국고객 원문 <script>window.__reportInjection = 1</script> & "A"';
const shipmentValues = {
  customer: '서울고객 <img src=x onerror="window.__reportInjection=2">',
  destination: '인천창고 & <A> "도착지"',
  vehicle: '차량-TEST-001',
  departure: '2026-10-12 09:00',
};
const fieldIds = ['customer', 'destination', 'vehicle', 'departure'] as const;
const previousEquipment = readTransportEquipment();

beforeEach(() => {
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  selectTransportEquipment(getTransportEquipment('20-standard')!);
});
afterEach(() => {
  setUiLanguage('ko');
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  selectTransportEquipment(previousEquipment);
  vi.restoreAllMocks();
});

function parseReport(html: string) {
  return new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
}

function expectNoFixedHangul(doc: Document, userText: readonly string[] = []) {
  const body = doc.body.cloneNode(true) as HTMLElement;
  body.querySelectorAll('script, style').forEach(element => element.remove());
  const attributes = [...body.querySelectorAll('*')].flatMap(element =>
    ['aria-label', 'title', 'placeholder', 'alt'].map(name => element.getAttribute(name) ?? '').filter(Boolean));
  const renderedCopy = [doc.title, body.textContent ?? '', ...attributes].join('\n');
  const fixedCopy = userText.reduce((text, value) => text.replaceAll(value, ''), renderedCopy);
  const untranslated = [...fixedCopy.matchAll(/.{0,45}[가-힣ㄱ-ㅎㅏ-ㅣ].{0,85}/g)].map(match => match[0]);
  expect(untranslated).toEqual([]);
  expect([...doc.scripts].map(script => script.textContent).join('\n')).not.toMatch(/[가-힣]/);
}

function installShipmentScript(doc: Document) {
  const events = new EventTarget();
  const print = vi.fn();
  const confirm = vi.fn<(message: string) => boolean>().mockReturnValue(false);
  const reportWindow = { addEventListener: events.addEventListener.bind(events), print, confirm };
  const scripts = [...doc.scripts];
  expect(scripts).toHaveLength(1);
  // Execute only the report's own static script against this isolated document.
  // User-provided strings must be text nodes, never executable script elements.
  new Function('document', 'window', scripts[0].textContent!)(doc, reportWindow);
  return { print, confirm, beforePrint: () => events.dispatchEvent(new Event('beforeprint')) };
}

// Same synthetic stacked-pallet shape as workOrderReportLanguage.test.ts; no solver runs.
function palletFixture() {
  const container: ContainerSpec = { length: 4.4, width: 2.2, height: 2.6, maxPayloadKg: 5000 };
  const cargo: CargoItem[] = [{ id: 'A', name: cargoName, length: .5, width: .5, height: .4, weightKg: 10, quantity: 4 }];
  const pallets = [0, 1].map(index => ({
    palletIndex: index + 1, x: 0, y: 0, z: index * .55, stackLevel: index + 1, stackColumn: 1,
    length: 1.1, width: 1.1, height: .15,
    cargoPlacements: [0, .5].map(x => ({ cargoId: 'A', x, y: 0, z: .15 + index * .55, length: .5, width: .5, height: .4, weightKg: 10 })),
    cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
    cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
    centerOfGravity: { x: .5, y: .25, z: .3 + index * .55 },
  }));
  const snapshot: PalletWorkSnapshot = {
    spec: { length: 1.1, width: 1.1, height: .15, tareWeightKg: 25, maxLoadKg: 1000,
      maxStackLevels: 2, maxSupportedTopWeightKg: 1000, useCornerGuards: false,
      cornerGuardWeightKg: 2, cornerGuardExtraHeightM: .03, useWrapping: false,
      wrappingWeightKg: 1.5, wrappingExtraHeightM: .01, minimizePackaging: true },
    result: { pallets, placements: pallets.flatMap(pallet => pallet.cargoPlacements), remaining: [],
      palletCount: 2, loadedCargoWeightKg: 40, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0,
      packagedPalletCount: 0, totalPalletizedWeightKg: 90, consolidatedPallets: 0,
      lateralImbalanceKg: 0, stackedPallets: 1, maxUsedStackLevel: 2,
      optimization: { selectedStackTarget: 2, candidateCount: 2, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 } },
  };
  const certification: InertiaCertification = {
    status: 'passed', mode: 'pallets', targetSignature: 'legacy-test-only', testedAt: '2026-10-12T00:00:00Z',
    securing: { level: 2, levelLabel: '2차 보강 · 밴딩+각대+랩핑', palletCount: 2, palletWeightKg: 50,
      bandingStraps: 6, bandingLengthM: 18, cornerGuards: 8, cornerGuardLengthM: 3.2, wrappingLengthM: 28,
      antiSlipMats: 2, dunnageBlocks: 0, loadBars: 0, estimatedAddedWeightKg: 2.1, estimatedNonCargoWeightKg: 52.1 },
    testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: .006,
    maxCargoRelativeSlipM: .003, maxSupportShiftM: .004, maxTiltDeg: .9, maxCargoRestraintForceN: 2400,
    results: {}, payloadWithinLimit: true,
  };
  return { container, cargo, snapshot, certification };
}

describe.each(['en', 'vi'] as const)('%s generated browser-report fixture', language => {
  it('has fully localized carton text, SVG labels, user content and immutable placement data', () => {
    const fixture = reportFixture();
    fixture.cargo[0].name = cargoName;
    const original = JSON.stringify(fixture);
    setUiLanguage(language);
    const doc = parseReport(buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result));
    const text = copy[language];
    expect(doc.documentElement.lang).toBe(language);
    expect(doc.title).toBe(text.title);
    const headings = [...doc.querySelectorAll('h1, h2')].map(heading => heading.textContent);
    expect(headings).toEqual(expect.arrayContaining([text.title, text.layout, text.checklist, text.final]));
    expect(doc.querySelectorAll('.zone-table tbody tr')).toHaveLength(5);
    expect(doc.querySelectorAll('.zone-progress article')).toHaveLength(5);
    expect(doc.querySelector('.zone-table tfoot')?.textContent).toContain('895');
    expect(doc.querySelectorAll('.partial-locations li')).toHaveLength(3);
    expect(doc.querySelector('.zone-legend')?.textContent).toContain(cargoName);
    expect(doc.querySelectorAll('.zone-legend script')).toHaveLength(0);
    expect(doc.querySelector('.report-status')?.classList.contains('neutral')).toBe(true);
    expect(doc.querySelector('.report-status')?.textContent).toContain(text.incomplete);
    expect(doc.querySelector('.watermark')?.textContent).toBe(text.review);
    expect(doc.querySelector('aside.technical-note')?.textContent).toContain(text.disclaimer);
    expectNoFixedHangul(doc, [cargoName]);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  it('keeps the generated locale in cancel/accept/repeat and beforeprint shipment flows', () => {
    const fixture = reportFixture();
    setUiLanguage(language);
    const html = buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result);
    setUiLanguage(language === 'en' ? 'vi' : 'en');
    const doc = parseReport(html);
    const text = copy[language];
    const { print, confirm, beforePrint } = installShipmentScript(doc);
    const button = doc.querySelector<HTMLButtonElement>('[data-report-print]')!;
    const inputs = fieldIds.map(id => doc.querySelector<HTMLInputElement>(`[data-shipment-input="${id}"]`)!);
    const values = fieldIds.map(id => doc.querySelector<HTMLElement>(`[data-shipment-value="${id}"]`)!);
    expect(inputs.map(input => input.getAttribute('aria-label'))).toEqual(text.fields);
    expect(inputs.map(input => input.placeholder)).toEqual(Array(4).fill(text.missing));
    button.click();
    expect(confirm).toHaveBeenLastCalledWith(text.missingPrefix + text.fields.join(', ') + text.missingQuestion);
    expect(print).not.toHaveBeenCalled();
    for (const [index, id] of fieldIds.entries()) {
      inputs[index].value = shipmentValues[id];
      inputs[index].dispatchEvent(new Event('input'));
      expect(values[index].textContent).toBe(shipmentValues[id]);
      expect(values[index].children).toHaveLength(0);
    }
    expect(doc.querySelector('#shipment-input-status')?.textContent).toBe(text.complete);
    button.click();
    expect(print).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    inputs[3].value = '   ';
    inputs[3].dispatchEvent(new Event('input'));
    button.click();
    expect(confirm).toHaveBeenLastCalledWith(text.missingPrefix + text.fields[3] + text.missingQuestion);
    expect(print).toHaveBeenCalledTimes(1);
    expect(inputs[0].value).toBe(shipmentValues.customer);
    confirm.mockReturnValueOnce(true);
    button.click();
    expect(print).toHaveBeenCalledTimes(2);
    expect(values[3].textContent).toBe(text.missing);
    expect(values[3].classList.contains('shipment-missing')).toBe(true);
    inputs[3].value = '2026-10-13 10:30';
    beforePrint();
    expect(values[3].textContent).toBe('2026-10-13 10:30');
    expect(values[3].classList.contains('shipment-missing')).toBe(false);
    expect(doc.querySelector('#shipment-input-status')?.textContent).toBe(text.complete);
    button.click();
    expect(print).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(doc.querySelector('.watermark')?.textContent).toBe(text.review);
    expect(doc.querySelector('.report-status')?.classList.contains('good')).toBe(false);
    expectNoFixedHangul(doc, Object.values(shipmentValues));
  });

  it('retains numerical-review warnings and original limits in the generated print document', () => {
    const fixture = reportFixture();
    fixture.container.limitReview = { mode: 'what-if', maxPayloadKg: 30000 };
    const original = JSON.stringify(fixture);
    setUiLanguage(language);
    const doc = parseReport(buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result));
    expect(doc.querySelector('.watermark')?.textContent).toBe(copy[language].whatIf);
    expect(doc.querySelector('.limit-review-warning')).not.toBeNull();
    expect(doc.querySelector('.report-status')?.textContent).toContain(copy[language].whatIf);
    expect(doc.querySelector('.report-status')?.classList.contains('caution')).toBe(true);
    expect(doc.querySelector('.report-status')?.classList.contains('good')).toBe(false);
    expectNoFixedHangul(doc);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  it('localizes the stacked-pallet diagram and work sequence while preserving the review watermark', () => {
    const fixture = palletFixture();
    const original = JSON.stringify(fixture);
    setUiLanguage(language);
    const doc = parseReport(buildPalletLoadingReportHtml(fixture.container, fixture.cargo, fixture.snapshot, fixture.certification));
    expect(doc.documentElement.lang).toBe(language);
    expect(doc.title).toBe(copy[language].palletTitle);
    expect(doc.querySelectorAll('.diagrams svg')).toHaveLength(2);
    expect(doc.querySelectorAll('.work tbody tr')).toHaveLength(2);
    expect(doc.querySelectorAll('.sequence article')).toHaveLength(2);
    expect(doc.querySelector('.work')?.textContent).toContain(cargoName);
    expect(doc.querySelectorAll('.work script')).toHaveLength(0);
    expect(doc.querySelector('.technical')?.textContent).toContain(copy[language].disclaimer);
    expect(doc.querySelector('.watermark')?.textContent).toBe(copy[language].review);
    expect(doc.querySelector('.report-status')?.classList.contains('danger')).toBe(true);
    for (const value of ['41.3%', '80%', '1700', '220', '850', '110']) {
      expect(doc.querySelector('.recommendations')?.textContent).toContain(value);
    }
    expectNoFixedHangul(doc, [cargoName]);
    expect(JSON.stringify(fixture)).toBe(original);
  });
});
