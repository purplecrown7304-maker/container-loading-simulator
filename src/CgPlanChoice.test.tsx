import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CgPlanChoice from './CgPlanChoice';
import { cgCompliantAlternativeForResult } from './engine/cgCompliantPlan';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

vi.mock('./engine/cgCompliantPlan', async importOriginal => ({
  ...await importOriginal<object>(),
  cgCompliantAlternativeForResult: vi.fn(),
}));

const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
const cargo: CargoItem[] = [{ id: 'H', name: 'H', length: .6, width: .4, height: .4, weightKg: 45, quantity: 10 }];
const placement = (index: number) => ({ cargoId: 'H', x: index * .6, y: 0, z: 0, length: .6, width: .4, height: .4, weightKg: 45 });
const full: LoadingResult = {
  placements: Array.from({ length: 10 }, (_, index) => placement(index)),
  remaining: [], loadedWeightKg: 450, usedVolumeM3: .96, validationIssues: [],
  operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '길이 CG 오류', placementIndexes: [], value: .8, limit: .4 }],
  securingBudget: { level: 1, reservedWeightKg: 2, requiredWeightKg: 2, totalTransportWeightKg: 452 },
};
const compliant: LoadingResult = {
  ...full,
  placements: full.placements.slice(0, 8),
  remaining: [{ cargoId: 'H', quantity: 2, reason: '길이 방향 무게중심 허용범위를 지키기 위해 제외', reasonCode: 'CG_LIMIT' }],
  loadedWeightKg: 360,
  operationalFindings: [],
  securingBudget: { level: 1, reservedWeightKg: 2, requiredWeightKg: 2, totalTransportWeightKg: 362 },
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(cgCompliantAlternativeForResult).mockReturnValue({
    result: compliant,
    removed: [{ cargoId: 'H', quantity: 2, reasonCode: 'CG_LIMIT', reason: '길이 방향 무게중심 허용범위를 지키기 위해 제외' }],
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('shows full and CG-compliant plans side by side and returns the operator choice', async () => {
  const onChoose = vi.fn();
  await act(async () => root.render(<CgPlanChoice container={container} cargo={cargo} fullResult={full} onChoose={onChoose} />));
  expect(host.textContent).toContain('전체 적재안');
  expect(host.textContent).toContain('CG 충족안');
  expect(host.textContent).toContain('10 EA');
  expect(host.textContent).toContain('8 EA');
  expect(host.textContent).toContain('2 EA · CG_LIMIT');
  expect(host.textContent).toContain('오류 표시 유지');
  expect(cgCompliantAlternativeForResult).toHaveBeenCalledWith(container, cargo, full, expect.objectContaining({ publish: false }));

  const buttons = [...host.querySelectorAll('button')];
  await act(async () => buttons.find(button => button.textContent === '전체 적재안 선택')!.click());
  expect(onChoose).toHaveBeenLastCalledWith('full', full);

  await act(async () => buttons.find(button => button.textContent === 'CG 충족안 선택')!.click());
  expect(onChoose).toHaveBeenLastCalledWith('cg', compliant);
});
