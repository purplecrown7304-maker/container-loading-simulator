import { afterEach, expect, it, vi } from 'vitest';
import { cancelPendingCertification, FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, NO_LOAD_RESULT_EVENT, requestExactCertification, requestNextPalletCertification } from './autoCertification';
import { publishPhysicsTarget, clearPhysicsTarget } from './physicsTarget';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import type { PhysicsTarget } from './physicsTarget';
vi.mock('./engine/physicsValidation', () => ({ runPhysicsValidationSuite: vi.fn() }));

afterEach(() => { cancelPendingCertification(); clearPhysicsTarget('boxes'); clearPhysicsTarget('pallets'); vi.clearAllMocks(); });
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

it('cancels a queued pallet validation before its microtask starts', async () => {
  const target: PhysicsTarget = { mode: 'pallets', container: { length: 1, width: 1, height: 1, maxPayloadKg: 100 }, cargo: [], result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .2, width: .2, height: .2, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .008, validationIssues: [],
  } };
  requestNextPalletCertification(); publishPhysicsTarget(target); cancelPendingCertification();
  await Promise.resolve();
  expect(runPhysicsValidationSuite).not.toHaveBeenCalled();
});

it('ignores late progress and completion from cancelled final validation', async () => {
  let resolve!: (result: Awaited<ReturnType<typeof runPhysicsValidationSuite>>) => void;
  let reportProgress!: NonNullable<Parameters<typeof runPhysicsValidationSuite>[2]>;
  vi.mocked(runPhysicsValidationSuite).mockImplementation((_container, _placements, progress) => {
    reportProgress = progress!;
    return new Promise(done => { resolve = done; });
  });
  const progress = vi.fn(), complete = vi.fn();
  window.addEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, progress);
  window.addEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, complete);
  requestExactCertification({ mode: 'boxes', container: { length: 1, width: 1, height: 1, maxPayloadKg: 100 }, cargo: [], result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .2, width: .2, height: .2, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .008, validationIssues: [],
  } });
  cancelPendingCertification(); progress.mockClear();
  reportProgress(.8, 'settle'); resolve({} as Awaited<ReturnType<typeof runPhysicsValidationSuite>>);
  await Promise.resolve();
  expect(progress).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  window.removeEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, progress);
  window.removeEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, complete);
});
