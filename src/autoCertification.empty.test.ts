import { afterEach, expect, it, vi } from 'vitest';
import { NO_LOAD_RESULT_EVENT, requestExactCertification, requestNextPalletCertification } from './autoCertification';
import { publishPhysicsTarget, clearPhysicsTarget } from './physicsTarget';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import type { PhysicsTarget } from './physicsTarget';
vi.mock('./engine/physicsValidation', () => ({ runPhysicsValidationSuite: vi.fn() }));

afterEach(() => { clearPhysicsTarget('boxes'); clearPhysicsTarget('pallets'); vi.clearAllMocks(); });
it.each(['boxes', 'pallets'] as const)('finishes an all-unloaded %s run without falsely certifying an empty plan', async mode => {
  const finished = vi.fn(); window.addEventListener(NO_LOAD_RESULT_EVENT, finished);
  const target: PhysicsTarget = { mode, container: { length: 1, width: 1, height: 1, maxPayloadKg: 100 }, cargo: [{ id: 'BIG', name: 'BIG', length: 2, width: 2, height: 2, quantity: 1, weightKg: 1 }], result: { placements: [], remaining: [{ cargoId: 'BIG', quantity: 1, reason: '박스 크기가 맞지 않음' }], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] } };
  if (mode === 'boxes') requestExactCertification(target);
  else { requestNextPalletCertification(); publishPhysicsTarget(target); }
  await Promise.resolve();
  expect(finished).toHaveBeenCalledOnce();
  expect((finished.mock.calls[0][0] as CustomEvent<PhysicsTarget>).detail.result.remaining[0].reason).toContain('크기');
  expect(runPhysicsValidationSuite).not.toHaveBeenCalled();
  window.removeEventListener(NO_LOAD_RESULT_EVENT, finished);
});
