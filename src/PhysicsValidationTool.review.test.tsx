import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import PhysicsValidationTool, { OPEN_PHYSICS_VALIDATION_EVENT, PHYSICS_VALIDATION_RESULT_EVENT } from './PhysicsValidationTool';
import type { PhysicsValidationSuite } from './engine/physicsValidation';
import { runPhysicsValidationSuiteParallel as runPhysicsValidationSuite } from './physicsParallel';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';

vi.mock('./physicsParallel', () => ({ runPhysicsValidationSuiteParallel: vi.fn() }));
const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 1, width: 1, height: 1, maxPayloadKg: 100, limitReview: { mode: 'what-if', maxPayloadKg: 200 } },
  cargo: [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 1 }],
  result: { placements: [{ cargoId: 'A', x: .25, y: .25, z: 0, length: .5, width: .5, height: .5, weightKg: 10 }], loadedWeightKg: 10, usedVolumeM3: .125, remaining: [], validationIssues: [] },
};
afterEach(() => { clearPhysicsTarget(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('discards late physics results after a review threshold change and keeps its warning visible', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let resolve!: (value: PhysicsValidationSuite) => void;
  vi.mocked(runPhysicsValidationSuite).mockReturnValue(new Promise(done => { resolve = done; }));
  publishPhysicsTarget(target);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const published = vi.fn(); window.addEventListener(PHYSICS_VALIDATION_RESULT_EVENT, published);
  try {
    await act(async () => root.render(<PhysicsValidationTool />));
    await act(async () => window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT)));
    expect(runPhysicsValidationSuite).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('WHAT-IF REVIEW');
    await act(async () => publishPhysicsTarget({ ...target, container: { ...target.container, limitReview: { mode: 'what-if', maxPayloadKg: 300 } } }));
    await act(async () => resolve({} as PhysicsValidationSuite));
    expect(published).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('WHAT-IF REVIEW');
  } finally {
    window.removeEventListener(PHYSICS_VALIDATION_RESULT_EVENT, published);
    await act(async () => root.unmount()); host.remove();
  }
});
