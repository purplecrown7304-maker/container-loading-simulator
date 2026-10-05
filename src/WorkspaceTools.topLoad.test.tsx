import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkspaceTools from './WorkspaceTools';
import { loginLocalOperator } from './localOperator';
import { readPersonalBoxCatalog, writePersonalBoxCatalog } from './personalBoxCatalog';
import { OPEN_WORKSPACE_EVENT } from './uiEvents';
import { applyPersonalStackPolicyToCargo } from './boxStackingPolicy';

let root: Root;
let host: HTMLDivElement;
const item = { id: 'BOX-TEST', name: '시험 박스', length: .235, width: .31, height: .265, weightKg: 7.8, quantity: 1, maxStackLayers: 10, maxTopLoadKg: 80 };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  const operator = loginLocalOperator('시험 작업자')!;
  writePersonalBoxCatalog(operator, [item]);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<WorkspaceTools />); });
  await act(async () => { window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'boxes' } })); });
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
  expect(applyPersonalStackPolicyToCargo(item, saved).maxTopLoadKg).toBe(expected);
  if (expected === 0) expect(document.body.textContent).toContain('0 · 위에 적재 금지');
  await click('수정');
  const reopened = [...document.querySelectorAll('label')].find(node => node.textContent === '상부 허용하중(kg)');
  expect(reopened!.querySelector('input')!.value).toBe(value);
});
