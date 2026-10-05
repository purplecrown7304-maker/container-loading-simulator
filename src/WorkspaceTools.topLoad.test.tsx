import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkspaceTools from './WorkspaceTools';
import { loginLocalOperator } from './localOperator';
import { readPersonalBoxCatalog, writePersonalBoxCatalog } from './personalBoxCatalog';
import { OPEN_WORKSPACE_EVENT } from './uiEvents';
import { applyPersonalStackPolicyToCargo } from './boxStackingPolicy';
import * as XLSX from 'xlsx';
import { createBoxCatalogWorkbook, downloadBoxCatalog } from './excel';

vi.mock('./excel', async importOriginal => ({
  ...await importOriginal<typeof import('./excel')>(),
  downloadBoxCatalog: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;
const item = { id: 'BOX-TEST', name: '시험 박스', length: .235, width: .31, height: .265, weightKg: 7.8, quantity: 1, maxStackLayers: 10, maxTopLoadKg: 80 };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  vi.clearAllMocks();
  const operator = loginLocalOperator('시험 작업자')!;
  writePersonalBoxCatalog(operator, [item]);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<WorkspaceTools />); });
  await act(async () => { window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'boxes' } })); });
});

it('exports all registered boxes despite filtering and applies edited Excel without losing handling constraints', async () => {
  const operator = loginLocalOperator('시험 작업자')!;
  const second = { ...item, id: 'SECOND', maxTopLoadKg: 0, topLoadLimitExplicit: true, thisSideUp: true, friction: .6, recommendationRegistration: 'explicit' as const, catalogOrigin: 'recommendation' as const };
  await act(async () => {
    writePersonalBoxCatalog(operator, [item, second]);
    window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'boxes' } }));
  });
  const search = document.querySelector<HTMLInputElement>('input[placeholder="박스코드, 내용물 검색"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'BOX-TEST');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('등록 목록 엑셀 다운로드');
  const exported = vi.mocked(downloadBoxCatalog).mock.calls[0][0];
  expect(exported.map(box => box.id)).toEqual(['BOX-TEST', 'SECOND']);
  const workbook = createBoxCatalogWorkbook(exported);
  workbook.Sheets.Boxes.H2 = { t: 'n', v: 6 };
  workbook.Sheets.Boxes.I2 = { t: 'n', v: 45 };
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const upload = document.querySelector<HTMLInputElement>('input[aria-label="박스 목록 엑셀 업로드"]')!;
  Object.defineProperty(upload, 'files', { configurable: true, value: [{ arrayBuffer: async () => bytes }] });
  await act(async () => { upload.dispatchEvent(new Event('change', { bubbles: true })); });
  const saved = readPersonalBoxCatalog(operator);
  expect(saved).toHaveLength(2);
  expect(saved[0]).toMatchObject({ maxStackLayers: 6, maxTopLoadKg: 45, topLoadLimitExplicit: true });
  expect(saved[1]).toMatchObject(second);
  expect(applyPersonalStackPolicyToCargo(item, saved[1]).maxTopLoadKg).toBe(0);
  expect(document.body.textContent).toContain('기존 갱신 2종');
  await click('직전 변경 되돌리기');
  expect(readPersonalBoxCatalog(operator)[0].maxTopLoadKg).toBe(80);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
}

it.each([['0', 0], ['45', 45], ['', undefined]] as const)('saves and reopens top load %s without changing its meaning', async (value, expected) => {
  await click('수정');
  const label = [...document.querySelectorAll('label')].find(node => node.textContent === '상부 허용하중(kg)');
  const input = label!.querySelector('input')!;
  expect(input.value).toBe('80');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('저장');
  const operator = loginLocalOperator('시험 작업자')!;
  const saved = readPersonalBoxCatalog(operator)[0];
  expect(saved.maxTopLoadKg).toBe(expected);
  expect(saved).toMatchObject({ maxStackLayers: 10, topLoadLimitExplicit: true });
  expect(saved.strengthUnverified).toBe(expected === undefined);
  expect(applyPersonalStackPolicyToCargo(item, saved).maxTopLoadKg).toBe(expected ?? 0);
  if (expected === undefined) expect(applyPersonalStackPolicyToCargo(item, saved).maxStackLayers).toBe(1);
  if (expected === 0) expect(document.body.textContent).toContain('0 · 위에 적재 금지');
  await click('수정');
  const reopened = [...document.querySelectorAll('label')].find(node => node.textContent === '상부 허용하중(kg)');
  expect(reopened!.querySelector('input')!.value).toBe(value);
});
