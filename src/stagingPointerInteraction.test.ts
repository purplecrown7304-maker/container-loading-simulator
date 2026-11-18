import { Ray, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStagingPointerInteraction, type StagingPointerCallbacks, type StagingPointerUnit } from './stagingPointerInteraction';

const unit: StagingPointerUnit = { id: 'stable-pallet', center: [5, .5, 6], planeY: .5, kind: 'support', index: 2 };
type EventOptions = { button?: number; pointerId?: number; clientX?: number; clientY?: number; x?: number; z?: number;
  ray?: Ray; target?: unknown; delta?: number };
const live: Array<ReturnType<typeof createStagingPointerInteraction>> = [];
afterEach(() => { live.splice(0).forEach(interaction => interaction.dispose()); vi.restoreAllMocks(); });

function setup() {
  const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
  let callbacks: StagingPointerCallbacks = { resolve: vi.fn(() => unit), canDrag: vi.fn(() => true),
    onSelect: vi.fn(), onInspect: vi.fn(), onDragStart: vi.fn(), onDragMove: vi.fn(), onDragEnd: vi.fn(), onDraggingChange: vi.fn() };
  const interaction = createStagingPointerInteraction(() => callbacks); live.push(interaction);
  const event = ({ button = 0, pointerId = 3, clientX = 10, clientY = 20, x = 4, z = 4,
    ray = new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0)), target: override = target, delta = 0 }: EventOptions = {}) => ({
    button, pointerId, clientX, clientY, ray, target: override, delta, stopPropagation: vi.fn(),
    nativeEvent: new MouseEvent('contextmenu', { button, clientX, clientY, cancelable: true }),
  }) as unknown as ThreeEvent<PointerEvent>;
  const context = (options: EventOptions = {}) => event({ ...options, button: 2 }) as unknown as ThreeEvent<MouseEvent>;
  const windowPointer = (type: string, options: PointerEventInit = {}) => window.dispatchEvent(new PointerEvent(type,
    { pointerId: 3, button: 2, clientX: 10, clientY: 20, ...options }));
  return { interaction, handlers: interaction.handlers, target, event, context, windowPointer,
    get callbacks() { return callbacks; }, setCallbacks(value: Partial<StagingPointerCallbacks>) { callbacks = { ...callbacks, ...value }; } };
}

function begin(s: ReturnType<typeof setup>) {
  s.handlers.onPointerDown(s.event());
  s.handlers.onPointerMove(s.event({ clientX: 14, x: 6, z: 5 }));
}

describe('staging pointer ownership', () => {
  it('starts at four pixels and preserves the centre-to-grip offset through move and release', () => {
    const s = setup(), before = JSON.stringify(unit), down = s.event();
    s.handlers.onPointerDown(down);
    expect(s.target.setPointerCapture).toHaveBeenCalledExactlyOnceWith(3);
    expect(s.callbacks.onSelect).toHaveBeenCalledExactlyOnceWith(unit.id);
    expect(s.callbacks.onDraggingChange).toHaveBeenCalledExactlyOnceWith(true);
    s.handlers.onPointerMove(s.event({ clientX: 13, x: 5, z: 4.5 }));
    expect(s.callbacks.onDragStart).not.toHaveBeenCalled(); expect(s.callbacks.onDragMove).not.toHaveBeenCalled();
    s.handlers.onPointerMove(s.event({ clientX: 14, x: 6, z: 5 }));
    expect(s.callbacks.onDragStart).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7] });
    expect(s.callbacks.onDragMove).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7] });
    s.handlers.onPointerUp(s.event({ clientX: 16, x: 8, z: 7 }));
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [9, .5, 9], cancelled: false });
    expect(s.target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(3);
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
    expect(JSON.stringify(unit)).toBe(before);
  });

  it('does not publish a drag for an ordinary click and ignores unrelated pointer IDs', () => {
    const s = setup(); s.handlers.onPointerDown(s.event());
    s.handlers.onPointerMove(s.event({ pointerId: 99, clientX: 50 }));
    s.handlers.onPointerUp(s.event({ pointerId: 99 }));
    expect(s.target.releasePointerCapture).not.toHaveBeenCalled();
    s.handlers.onPointerUp(s.event());
    expect(s.callbacks.onDragStart).not.toHaveBeenCalled(); expect(s.callbacks.onDragMove).not.toHaveBeenCalled();
    expect(s.callbacks.onDragEnd).not.toHaveBeenCalled();
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
  });

  it.each(['cancel', 'Escape', 'blur', 'pointercancel', 'lostcapture'] as const)('cancels an active drag on %s and restores pointer/control ownership once', cause => {
    const s = setup(); begin(s);
    if (cause === 'cancel') s.interaction.cancel();
    else if (cause === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else if (cause === 'blur') window.dispatchEvent(new Event('blur'));
    else if (cause === 'pointercancel') s.windowPointer('pointercancel');
    else s.handlers.onLostPointerCapture();
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
    expect(s.target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(3);
    s.handlers.onPointerUp(s.event()); s.interaction.cancel();
    expect(s.callbacks.onDragEnd).toHaveBeenCalledTimes(1); expect(s.callbacks.onDraggingChange).toHaveBeenCalledTimes(2);
  });
  it('handles native capture loss outside the canvas, ignores other pointers and restores controls exactly once', () => {
    const s = setup(); begin(s);
    // R3F does not forward native lostpointercapture to Object3D handlers.
    // Dispatch the actual window event rather than calling the factory handler.
    s.windowPointer('lostpointercapture', { pointerId: 99 });
    expect(s.callbacks.onDragEnd).not.toHaveBeenCalled(); expect(s.target.releasePointerCapture).not.toHaveBeenCalled();
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true]]);
    s.windowPointer('lostpointercapture');
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    expect(s.target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(3);
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
    s.windowPointer('lostpointercapture'); s.windowPointer('pointerup'); s.handlers.onPointerUp(s.event()); s.interaction.cancel();
    expect(s.callbacks.onDragEnd).toHaveBeenCalledTimes(1); expect(s.target.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(s.callbacks.onDraggingChange).toHaveBeenCalledTimes(2);
  });

  it('cancels with the last finite position if release has no ray-plane hit', () => {
    const s = setup(); begin(s);
    s.handlers.onPointerUp(s.event({ ray: new Ray(new Vector3(2, 10, 3), new Vector3(1, 0, 0)) }));
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
  });

  it('does not publish nonfinite ray positions during movement or release', () => {
    const s = setup(); begin(s);
    const invalidRay = new Ray(new Vector3(NaN, 10, 4), new Vector3(0, -1, 0));
    s.handlers.onPointerMove(s.event({ clientX: 18, ray: invalidRay }));
    expect(s.callbacks.onDragMove).toHaveBeenCalledTimes(1);
    s.handlers.onPointerUp(s.event({ ray: invalidRay }));
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
  });

  it('uses current readonly state and callbacks when an in-progress edit becomes unavailable', () => {
    const s = setup(), replacementEnd = vi.fn(); begin(s);
    s.setCallbacks({ canDrag: () => false, onDragEnd: replacementEnd });
    s.handlers.onPointerMove(s.event({ clientX: 16, x: 8, z: 7 }));
    expect(replacementEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    expect(s.target.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false]]);
  });

  it.each(['no unit', 'readonly', 'no apply callback', 'no hit', 'middle button', 'missing capture', 'failed capture'] as const)('skips %s without taking pointer/control ownership', reason => {
    const s = setup(), onDragEnd = s.callbacks.onDragEnd; let event = s.event();
    if (reason === 'no unit') s.setCallbacks({ resolve: () => null });
    else if (reason === 'readonly') s.setCallbacks({ canDrag: () => false });
    else if (reason === 'no apply callback') s.setCallbacks({ onDragEnd: undefined });
    else if (reason === 'no hit') event = s.event({ ray: new Ray(new Vector3(0, 10, 0), new Vector3(1, 0, 0)) });
    else if (reason === 'middle button') event = s.event({ button: 1 });
    else if (reason === 'missing capture') event = s.event({ target: {} });
    else s.target.setPointerCapture.mockImplementation(() => { throw new Error('capture refused'); });
    s.handlers.onPointerDown(event);
    expect(s.callbacks.onSelect).not.toHaveBeenCalled(); expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
    expect(s.callbacks.onDragStart).not.toHaveBeenCalled(); expect(onDragEnd).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled(); expect(s.target.releasePointerCapture).not.toHaveBeenCalled();
  });

  it.each(['center', 'plane', 'ray'] as const)('rejects a nonfinite %s before acquiring the pointer', reason => {
    const s = setup(); let event = s.event();
    if (reason === 'center') s.setCallbacks({ resolve: () => ({ ...unit, center: [Infinity, .5, 6] }) });
    else if (reason === 'plane') s.setCallbacks({ resolve: () => ({ ...unit, planeY: NaN }) });
    else event = s.event({ ray: new Ray(new Vector3(Infinity, 10, 4), new Vector3(0, -1, 0)) });
    s.handlers.onPointerDown(event);
    expect(s.target.setPointerCapture).not.toHaveBeenCalled(); expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
    expect(s.callbacks.onSelect).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'] as const)('inspects exactly once when contextmenu arrives %s pointerup', order => {
    const s = setup(); s.handlers.onPointerDown(s.event({ button: 2 }));
    if (order === 'before') {
      const context = s.context(); s.handlers.onContextMenu(context);
      expect(context.nativeEvent.defaultPrevented).toBe(true); expect(s.callbacks.onInspect).not.toHaveBeenCalled();
    }
    s.windowPointer('pointerup'); s.handlers.onPointerUp(s.event({ button: 2 }));
    if (order === 'after') {
      const context = s.context(); s.handlers.onContextMenu(context); expect(context.nativeEvent.defaultPrevented).toBe(true);
    }
    expect(s.callbacks.onInspect).toHaveBeenCalledExactlyOnceWith(unit);
    expect(s.callbacks.onSelect).not.toHaveBeenCalled(); expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'] as const)('keeps right-drag camera pan from opening details with a %s-release contextmenu', order => {
    const s = setup(); s.handlers.onPointerDown(s.event({ button: 2 }));
    if (order === 'before') s.handlers.onContextMenu(s.context());
    s.windowPointer('pointermove', { clientX: 14 }); s.windowPointer('pointerup', { clientX: 14 });
    if (order === 'after') s.handlers.onContextMenu(s.context({ clientX: 14 }));
    expect(s.callbacks.onInspect).not.toHaveBeenCalled(); expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
    expect(s.target.setPointerCapture).not.toHaveBeenCalled();
  });

  it('allows read-only inspection and uses the current callback when a pending context menu is released', () => {
    const s = setup(), inspect = vi.fn(); s.setCallbacks({ canDrag: () => false });
    s.handlers.onPointerDown(s.event({ button: 2 })); s.handlers.onContextMenu(s.context());
    s.setCallbacks({ onInspect: inspect }); s.windowPointer('pointerup');
    expect(inspect).toHaveBeenCalledExactlyOnceWith(unit);
    expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled(); expect(s.target.setPointerCapture).not.toHaveBeenCalled();
  });

  it('cancels a pending right-click inspection on blur without taking control of the camera', () => {
    const s = setup(); s.handlers.onPointerDown(s.event({ button: 2 })); s.handlers.onContextMenu(s.context());
    window.dispatchEvent(new Event('blur')); s.windowPointer('pointerup');
    expect(s.callbacks.onInspect).not.toHaveBeenCalled(); expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
  });

  it('skips missing context hits or callbacks and rejects a reported drag delta', () => {
    const s = setup(); s.handlers.onContextMenu(s.context({ delta: 5 }));
    expect(s.callbacks.onInspect).not.toHaveBeenCalled();
    s.setCallbacks({ resolve: () => null }); s.handlers.onContextMenu(s.context());
    expect(s.callbacks.onInspect).not.toHaveBeenCalled();
    s.setCallbacks({ resolve: () => unit, onInspect: undefined }); s.handlers.onPointerDown(s.event({ button: 2 }));
    expect(s.callbacks.onDraggingChange).not.toHaveBeenCalled();
  });

  it('disposes every window listener and active capture and can reactivate after a StrictMode cleanup', () => {
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
    const s = setup(); begin(s);
    const listeners = add.mock.calls.map(([type, callback, options]) => ({ type, callback, options }));
    expect(listeners.map(entry => entry.type).sort()).toEqual(['blur', 'keydown', 'lostpointercapture', 'pointercancel', 'pointermove', 'pointerup']);
    s.interaction.dispose(); s.interaction.dispose();
    for (const { type, callback, options } of listeners) expect(remove.mock.calls.some(([removedType, removedCallback, removedOptions]) =>
      removedType === type && removedCallback === callback && (removedOptions ?? false) === (options ?? false))).toBe(true);
    expect(remove).toHaveBeenCalledTimes(6);
    expect(s.callbacks.onDragEnd).toHaveBeenCalledExactlyOnceWith({ unitId: unit.id, point: [7, .5, 7], cancelled: true });
    s.handlers.onPointerDown(s.event()); s.handlers.onContextMenu(s.context());
    expect(s.target.setPointerCapture).toHaveBeenCalledTimes(1); expect(s.callbacks.onInspect).not.toHaveBeenCalled();
    s.interaction.activate(); s.handlers.onPointerDown(s.event());
    expect(s.target.setPointerCapture).toHaveBeenCalledTimes(2);
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false], [true]]);
    s.handlers.onPointerMove(s.event({ clientX: 14, x: 6, z: 5 })); s.windowPointer('lostpointercapture');
    expect(s.callbacks.onDragEnd).toHaveBeenCalledTimes(2); expect(s.target.releasePointerCapture).toHaveBeenCalledTimes(2);
    expect(vi.mocked(s.callbacks.onDraggingChange!).mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
