import { afterEach, expect, it, vi } from 'vitest';
import { cancelPendingCertification, requestExactCertification } from './autoCertification';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import type { PhysicsTarget } from './physicsTarget';
import { clearPhysicsTarget } from './physicsTarget';

vi.mock('./engine/physicsValidation', () => ({ runPhysicsValidationSuite: vi.fn() }));
vi.mock('./directWorkOrderEvents', () => ({ requestDirectWorkOrder: vi.fn() }));

afterEach(() => {
  cancelPendingCertification();
  clearPhysicsTarget('boxes');
  vi.clearAllMocks();
});

it('certifies an explicitly selected full plan while keeping CG as a verdict error and locking the layout', async () => {
  const target: PhysicsTarget = {
    mode: 'boxes',
    container: { length: 4, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'A', length: 1, width: 1, height: .5, weightKg: 100, quantity: 1 }],
    result: {
      placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 }],
      remaining: [], loadedWeightKg: 100, usedVolumeM3: .5, validationIssues: [],
      operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '무게중심 오류', placementIndexes: [], value: 1, limit: .5 }],
    },
  };
  vi.mocked(runPhysicsValidationSuite).mockResolvedValue({ worstScenario: 'braking' } as Awaited<ReturnType<typeof runPhysicsValidationSuite>>);

  requestExactCertification(target, { preserveSelectedPlan: true, allowCgVerdictError: true });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(runPhysicsValidationSuite).toHaveBeenCalledOnce();
  expect(requestDirectWorkOrder).toHaveBeenCalledWith(
    target.container,
    target.cargo,
    target.result,
    expect.objectContaining({ openReport: false, preserveSelectedPlan: true }),
  );
  expect(target.result.operationalFindings?.[0]).toMatchObject({ code: 'CG_LONGITUDINAL', severity: 'error' });
});
