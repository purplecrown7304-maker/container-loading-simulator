import ExcelImportActions from './ExcelImportActions';
import { downloadEnterprisePackagingWorkbook } from './enterprisePackagingExcelExport';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createBoxCatalogWorkbook, downloadCargoTemplate, parseBoxCatalogWorkbook, parseCargoWorkbook } from './excel';
import { createProductCatalogWorkbook, parseProductWorkbook } from './productExcel';
import { downloadProductPackagingTemplate, parseProductPackagingWorkbook } from './productPackagingExcel';
import { setUiLanguage, uiLocale, uiMessage, uiText, type UiLanguage } from './uiLanguage';
import { EXCEL_IMPORT_HEADERS, excelIssueMessage } from './excelPresentation';
import type { CargoItem } from './engine/types';
import type { CompanyProductItem } from './companyProduct';
import EnterpriseManufacturingSettings from './EnterpriseManufacturingSettings';
import TransportEquipmentSpecManager, { openTransportEquipmentSpecManager } from './TransportEquipmentSpecManager';
import WorkspaceTools from './WorkspaceTools';
import { OPEN_WORKSPACE_EVENT } from './uiEvents';
import { loginLocalOperator } from './localOperator';
import { readPersonalBoxCatalog, writePersonalBoxCatalog } from './personalBoxCatalog';
import { writeEnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';

vi.mock('xlsx', async importOriginal => ({ ...await importOriginal<object>(), writeFile: vi.fn() }));
const languages: UiLanguage[] = ['ko', 'en', 'vi'];
const box: CargoItem = { id: '한글-001', name: '박스 선택', length: .6, width: .4, height: .3, weightKg: 7.8, quantity: 3, maxStackLayers: 4, maxTopLoadKg: 100, cartonMaterial: 'double-wall', strengthSource: 'material-estimate', allowRotation: false, unloadPriority: 2 };
const product: CompanyProductItem = { id: '제품-00017', name: '기본', length: .2205, width: .15025, height: .1, weightKg: 1.2345, quantity: 17, requiresBoxPackaging: false, orientationPolicy: 'upright', allowRotation: false };
const file = (book: XLSX.WorkBook) => ({ arrayBuffer: async () => XLSX.write(book, { type: 'array', bookType: 'xlsx' }) }) as File;
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setUiLanguage('ko'); vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host.remove(); setUiLanguage('ko'); vi.unstubAllGlobals(); });
async function mount(node: React.ReactNode) { root = createRoot(host); await act(async () => root!.render(node)); }
function lastWorkbook() { return vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0]; }

describe('localized editable Excel files', () => {
  it.each(languages)('%s preserves Korean user fields, strength provenance, numeric precision and safety limits', async language => {
    setUiLanguage(language);
    const book = createBoxCatalogWorkbook([box, { ...box, id: '0002', name: '=한국 상자', maxTopLoadKg: undefined, strengthUnverified: true }]);
    const headers = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Boxes, { header: 1 })[0];
    expect(headers[0]).toBe(uiText('코드'));
    if (language !== 'ko') expect(headers.join(' ')).not.toMatch(/[가-힣]/);
    expect(book.Sheets.Boxes.B2.v).toBe('박스 선택');
    expect(book.Sheets.Boxes.B3.f).toBeUndefined();
    expect(book.Sheets.Boxes.M2.v).toBe(uiText('재질 추정'));
    // Import must accept all export languages independent of the currently selected UI language.
    setUiLanguage(language === 'vi' ? 'en' : 'vi');
    const parsed = await parseBoxCatalogWorkbook(file(book));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items[0]).toMatchObject(box);
    expect(parsed.items[1]).toMatchObject({ id: '0002', name: '=한국 상자', strengthUnverified: true });
    expect(parsed.items[1].maxTopLoadKg).toBeUndefined();
    expect(parsed.items[1].strengthSource).toBeUndefined();
    expect(box.name).toBe('박스 선택');
  });

  it.each(languages)('%s product exports round-trip opaque names and master fields', async language => {
    setUiLanguage(language);
    const book = createProductCatalogWorkbook([product]);
    expect(book.Sheets.Products.B2.v).toBe('기본');
    expect(book.Sheets.Products.A2.t).toBe('s');
    if (language !== 'ko') expect(XLSX.utils.sheet_to_json<string[]>(book.Sheets.Products, { header: 1 })[0].join(' ')).not.toMatch(/[가-힣]/);
    setUiLanguage('ko');
    const imported = await parseProductWorkbook(file(book));
    expect(imported.issues).toEqual([]);
    expect(imported.items[0]).toMatchObject({ id: product.id, name: product.name, length: product.length, width: product.width, weightKg: product.weightKg, requiresBoxPackaging: false });
  });

  it.each(languages)('%s cargo and packaging templates remain importable', async language => {
    setUiLanguage(language);
    downloadCargoTemplate();
    const cargo = await parseCargoWorkbook(file(lastWorkbook()));
    expect(cargo.issues).toEqual([]);
    expect(cargo.items).toHaveLength(2);
    expect(cargo.items[0]).toMatchObject({ id: 'BOX-A', length: .6, quantity: 70, maxTopLoadKg: 100 });
    downloadProductPackagingTemplate();
    const book = lastWorkbook();
    expect(book.SheetNames).toEqual(['Products', 'Boxes']);
    book.Sheets.Products.B2.v = '한국 입력 제품';
    book.Sheets.Boxes.B2.v = '박스 선택';
    setUiLanguage('ko');
    const packaging = await parseProductPackagingWorkbook(file(book));
    expect(packaging.issues).toEqual([]);
    expect(packaging.products[0]).toMatchObject({ name: '한국 입력 제품', quantity: 240, cushioningM: .005, productGapM: .001, maxInternalLayers: 3, orientationPolicy: 'base-rotation' });
    expect(packaging.boxes[0]).toMatchObject({ name: '박스 선택', innerLength: .59, tareWeightKg: .8, maxTopLoadKg: 80 });
  });

  it.each(languages)('%s keeps canonical validation messages while translating their presentation', async language => {
    setUiLanguage(language);
    const book = createBoxCatalogWorkbook([{ ...box, quantity: -1 }]);
    const parsed = await parseBoxCatalogWorkbook(file(book));
    expect(parsed.items).toEqual([]);
    expect(parsed.issues[0].message).toBe('수량은 0 이상의 정수여야 합니다. 0은 비활성 SKU로 유지됩니다.');
    expect(parsed.issues[0].code).toBe('한글-001');
    if (language !== 'ko') expect(uiMessage(parsed.issues[0].message)).not.toMatch(/[가-힣]/);
  });

  it('uses unambiguous localized header aliases', () => {
    for (const language of languages) {
      const labels = EXCEL_IMPORT_HEADERS.map(header => uiText(header, [], language));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

it('switches manufacturing settings and existing status messages without changing stored data', async () => {
  writeEnterprisePackagingPlannerState({ products: [product], boxes: [], container: { length: 6, width: 2, height: 2, maxPayloadKg: 1000 } });
  await mount(<EnterpriseManufacturingSettings />);
  const select = host.querySelector('select')!;
  await act(async () => { select.value = '10'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).toContain('10mm 제조 그리드 적용');
  for (const language of ['en', 'vi', 'ko'] as const) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('[role="status"]')!.textContent).toBe(uiText('{0}mm 제조 그리드 적용 · 기존 분석 결과는 다시 계산해야 합니다.', [10]));
    expect(host.querySelector('h3')!.textContent).toBe(uiText('박스 제조 치수 단위'));
    expect(select.value).toBe('10');
  }
});

it('updates open equipment specifications in all languages', async () => {
  await mount(<TransportEquipmentSpecManager />);
  await act(async () => openTransportEquipmentSpecManager());
  const values = [...host.querySelectorAll<HTMLInputElement>('input[type="number"]')].map(input => input.value);
  for (const language of languages) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('h2')!.textContent).toBe(uiText('차량 규격 관리'));
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe(uiText('차량 규격 관리'));
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="number"]')].map(input => input.value)).toEqual(values);
  }
});

it('keeps Korean personal box names and data unchanged while translating an open workspace', async () => {
  const operator = loginLocalOperator('한국 작업자')!;
  writePersonalBoxCatalog(operator, [box]);
  await mount(<WorkspaceTools />);
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'boxes' } })));
  const saved = JSON.stringify(readPersonalBoxCatalog(operator));
  for (const language of languages) {
    await act(async () => setUiLanguage(language));
    expect(document.querySelector('.workspace-modal header b')!.textContent).toBe(uiText('박스 선택'));
    const row = document.querySelector('tbody tr')!;
    expect(row.children[2].textContent).toBe('한글-001');
    expect(row.children[3].textContent).toBe('박스 선택');
    expect(JSON.stringify(readPersonalBoxCatalog(operator))).toBe(saved);
  }
});

it.each(languages)('%s formats saved plan dates with the selected locale', async language => {
  const savedAt = '2026-10-12T03:00:00.000Z';
  localStorage.setItem('container-loading-workspace-boxes-v1', JSON.stringify([{ id: '한글 계획', name: '박스 선택', savedAt, state: { container: { length: 6, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [box] } }]));
  setUiLanguage(language);
  await mount(<WorkspaceTools />);
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'data' } })));
  expect(document.querySelector('.saved-plan-list b')!.textContent).toBe('박스 선택');
  expect(document.querySelector('.saved-plan-list small')!.textContent).toBe(uiText('{0} · {1}종 화물', [new Date(savedAt).toLocaleString(uiLocale()), 1]));
});


it.each(languages)('%s enterprise exports localize presentation without touching names or calculations', language => {
  const container = { length: 3, width: 2, height: 2, maxPayloadKg: 1000 };
  const selectedProduct = { ...product, quantity: 3, maxUnitsPerBox: 2, requiresBoxPackaging: true };
  const catalogBox: BoxCatalogItem = { id: '한국-상자', name: '기본', innerLength: .6, innerWidth: .4, innerHeight: .3, outerLength: .62, outerWidth: .42, outerHeight: .32, tareWeightKg: .5, maxGrossWeightKg: 20, maxTopLoadKg: 80 };
  const plan = optimizeEnterprisePackaging(container, [selectedProduct], [catalogBox], { ...defaultEnterprisePackagingOptions, packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: false }, family: { ...defaultEnterprisePackagingOptions.family, enabled: false }, allowMixedResidualCartons: false });
  expect(plan.assignments).toHaveLength(1);
  const snapshot = JSON.stringify(plan);
  setUiLanguage(language);
  downloadEnterprisePackagingWorkbook(plan, container, [selectedProduct], [catalogBox]);
  const book = lastWorkbook();
  const assignments = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.ProductAssignments);
  expect(assignments[0][uiText('제품코드')]).toBe('제품-00017');
  expect(assignments[0][uiText('제품명')]).toBe('기본');
  expect(assignments[0][uiText('선정박스명')]).toBe('기본');
  expect(assignments[0][uiText('박스소스')]).toBe(uiText('보유박스'));
  expect(assignments[0][uiText('출하수량(EA)')]).toBe(3);
  if (language !== 'ko') for (const sheetName of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1 });
    if (rows.length) expect(rows[0].join(' ')).not.toMatch(/[가-힣]/);
  }
  expect(JSON.stringify(plan)).toBe(snapshot);
});

it('retranslates an existing import toast and error report without changing the canonical issue or user code', async () => {
  await mount(<ExcelImportActions />);
  const invalid = createBoxCatalogWorkbook([{ ...box, quantity: -1 }]);
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file(invalid)] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  for (const language of languages) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('.excel-import-toast')!.textContent).toBe(uiText('등록 가능한 행이 없습니다 · 오류 {0}건', [1]));
    const report = document.querySelector('.excel-report-list')!;
    expect(report.textContent).toContain('[한글-001]');
    expect(report.textContent).toContain(uiText('수량은 0 이상의 정수여야 합니다. 0은 비활성 SKU로 유지됩니다.'));
  }
});


it('translates nested empty-catalog import diagnostics reactively', async () => {
  const operator = loginLocalOperator('한국 작업자')!;
  writePersonalBoxCatalog(operator, [box]);
  await mount(<WorkspaceTools />);
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'boxes' } })));
  const invalid = createBoxCatalogWorkbook([{ ...box, quantity: -1 }]);
  const input = document.querySelector<HTMLInputElement>('input[aria-label="박스 목록 엑셀 업로드"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file(invalid)] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  for (const language of ['en', 'vi'] as const) {
    await act(async () => setUiLanguage(language));
    const text = document.querySelector('.workspace-modal footer')!.textContent!;
    expect(text).toContain(uiText('수량은 0 이상의 정수여야 합니다. 0은 비활성 SKU로 유지됩니다.'));
    expect(text).not.toMatch(/[가-힣]/);
  }
});

it('localizes built-in material choices in validation errors, keeping the parser message canonical', async () => {
  const book = createBoxCatalogWorkbook([box]);
  book.Sheets.Boxes.L2.v = 'invalid-material';
  const parsed = await parseBoxCatalogWorkbook(file(book));
  const canonical = parsed.issues[0].message;
  expect(canonical).toContain('이중골');
  for (const language of ['en', 'vi'] as const) {
    setUiLanguage(language);
    expect(excelIssueMessage(canonical)).not.toMatch(/[가-힣]/);
    expect(excelIssueMessage(canonical)).toContain(uiText('이중골 (BA·BC)'));
  }
  expect(parsed.issues[0].message).toBe(canonical);
});
