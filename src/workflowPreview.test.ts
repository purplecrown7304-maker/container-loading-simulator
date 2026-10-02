import { afterEach, describe, expect, it, vi } from 'vitest';
import { validatePlacements } from './engine/constraints';
import type { CargoItem, ContainerSpec } from './engine/types';
import { createWorkflowFloorPreview, publishWorkflowPreview, readWorkflowPreview, WORKFLOW_PREVIEW_EVENT } from './workflowPreview';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000 };
const item: CargoItem = { id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 20 };
afterEach(() => publishWorkflowPreview(null));

describe('view-only workflow preview', () => {
  it('stages valid real-size boxes on the floor without mutation or result publication', () => {
    const listener = vi.fn();
    window.addEventListener('container-loading:result', listener);
    const input = [Object.freeze({ ...item })];
    const preview = createWorkflowFloorPreview(container, input);
    expect(preview.shown).toBe(20);
    expect(validatePlacements(container, preview.result.placements)).toEqual([]);
    expect(preview.result.placements.every(p => p.z === 0 && p.height === item.height)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('container-loading:result', listener);
  });

  it('never shrinks oversized items and still shows subsequent valid cargo', () => {
    const preview = createWorkflowFloorPreview(container, [{ ...item, id: 'huge', length: 99, height: 99 }, item]);
    expect(preview.result.placements.every(p => p.cargoId === 'A')).toBe(true);
    expect(preview.shown).toBe(20);
  });

  it('rejects non-finite input and caps even enormous requested quantities', () => {
    const preview = createWorkflowFloorPreview(container, [{ ...item, length: NaN }, { ...item, id: 'small', length: .01, width: .01, quantity: 1_000_000 }]);
    expect(preview.shown).toBeLessThanOrEqual(240);
    expect(preview.result.placements.every(p => p.cargoId === 'small')).toBe(true);
    expect(validatePlacements(container, preview.result.placements)).toEqual([]);
  });

  it('obeys orientation, payload and floor loading limits', () => {
    const narrow = { ...container, length: 1, width: .5, maxPayloadKg: 10 };
    const cargo = { ...item, length: .4, width: .8, quantity: 2 };
    expect(createWorkflowFloorPreview(narrow, [{ ...cargo, allowRotation: false }]).shown).toBe(0);
    expect(createWorkflowFloorPreview(narrow, [cargo]).shown).toBe(1);
    expect(createWorkflowFloorPreview({ ...narrow, floorLoadLimitKgPerM2: 1 }, [cargo]).shown).toBe(0);
  });

  it('keeps the same snapshot for equal data so stage navigation cannot invalidate a result', () => {
    const listener = vi.fn();
    window.addEventListener(WORKFLOW_PREVIEW_EVENT, listener);
    publishWorkflowPreview({ kind: 'packaging', cargo: [item] });
    const snapshot = readWorkflowPreview();
    publishWorkflowPreview({ kind: 'packaging', cargo: [{ ...item }] });
    expect(readWorkflowPreview()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    publishWorkflowPreview({ kind: 'packaging', cargo: [{ ...item, quantity: 2 }] });
    expect(readWorkflowPreview()).not.toBe(snapshot);
    window.removeEventListener(WORKFLOW_PREVIEW_EVENT, listener);
  });
});
