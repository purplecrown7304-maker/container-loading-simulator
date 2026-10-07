import { afterEach, expect, it } from 'vitest';
import { loadContainer, restoreLoadingResult } from './engine/loadingEngine';
import { clearManualOverride } from './engine/manualOverride';
import type { CargoItem, ContainerSpec } from './engine/types';
import { readStoredState, STORAGE_KEY, writeStoredState } from './storage';

const container: ContainerSpec = { length: 4, width: 2.35, height: 2, maxPayloadKg: 2000, floorLoadLimitKgPerM2: 1500 };
const cargo: CargoItem[] = [{
  id: 'SAVE-A', name: 'SAVE-A', length: .6, width: 2.35, height: .8,
  weightKg: 120, quantity: 1, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: false,
}];

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  clearManualOverride();
});

it('persists a final direct-box result and revalidates its void-fill plan on restore', () => {
  const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
  expect(result.voidFillPlan?.fills.length).toBeGreaterThan(0);

  writeStoredState({ container, cargo, result });
  const stored = readStoredState();
  expect(stored?.result?.voidFillPlan).toEqual(result.voidFillPlan);

  const restored = restoreLoadingResult(stored!.container, stored!.cargo, stored!.result);
  expect(restored.voidFillPlan).toEqual(result.voidFillPlan);
  expect(restored.operationalFindings).toContainEqual(expect.objectContaining({ code: 'VOID_FILL_REQUIRED' }));
});
