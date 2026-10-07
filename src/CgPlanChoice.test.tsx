import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CgPlanChoice from './CgPlanChoice';
import { loadContainer } from './engine/loadingEngine';
import { clearManualOverride, readManualOverride } from './engine/manualOverride';
import type { CargoItem, ContainerSpec } from './engine/types';

const container: ContainerSpec = {
  length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500, unloadingPolicy: 'strict',
};
const item = (id: string, weightKg: number, quantity: number, unloadPriority: number): CargoItem => ({
  id, name: id, length: .6, width: .4, height: .4, weightKg, quantity,
  maxStackLayers: 10, maxTopLoadKg: 100000, unloadPriority,
});
const cargo = [item('H', 45, 330, 1), item('L', 3, 300, 2)];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  clearManualOverride();
  host.remove();
  vi.unstubAllGlobals();
});

it('shows full and CG-compliant plans side by side and applies the selected compliant plan', async () => {
  const full = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
  expect(full.placements).toHaveLength(630);
  expect(full.operationalFindings).toContainEqual(expect.objectContaining({ code: 'CG_LONGITUDINAL', severity: 'error' }));

  await act(async () => root.render(<CgPlanChoice container={container} cargo={cargo} result={full} />));
  expect(host.textContent).toContain('전체 적재안');
  expect(host.textContent).toContain('630 EA');
  expect(host.textContent).toContain('CG 충족안');
  expect(host.textContent).toContain('545 EA');
  expect(host.textContent).toContain('85 EA · CG_LIMIT');

  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(current => current.textContent === 'CG 충족안 선택');
  expect(button).toBeDefined();
  await act(async () => button!.click());

  const saved = readManualOverride(container, cargo);
  expect(saved?.placements).toHaveLength(545);
  expect(saved?.remaining.filter(row => row.reasonCode === 'CG_LIMIT').reduce((sum, row) => sum + row.quantity, 0)).toBe(85);
  expect(saved?.operationalFindings?.some(finding => finding.code === 'CG_LONGITUDINAL' && finding.severity === 'error')).toBe(false);
}, 20_000);
