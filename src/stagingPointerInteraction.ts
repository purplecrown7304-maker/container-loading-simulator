import { Plane, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { StagingYardDrag } from './ThreeStagingYard';

type PointerHit = ThreeEvent<PointerEvent | MouseEvent>;
export type StagingPointerUnit = {
  id: string;
  /** Floor-footprint centre in the main scene's Y-up world. */
  center: [number, number, number];
  planeY: number;
  kind?: 'cargo' | 'support';
  index?: number;
};
export type StagingPointerCallbacks = {
  resolve: (event: PointerHit) => StagingPointerUnit | null;
  canDrag: () => boolean;
  onSelect?: (id: string) => void;
  onInspect?: (unit: StagingPointerUnit) => void;
  onDragStart?: (event: StagingYardDrag) => void;
  onDragMove?: (event: StagingYardDrag) => void;
  onDragEnd?: (event: StagingYardDrag) => void;
  onDraggingChange?: (value: boolean) => void;
};

/** Pointer ownership only. Candidate coordinates are never themselves permission
 * to change a load. The command owner revalidates the complete plan on release. */
export function createStagingPointerInteraction(read: () => StagingPointerCallbacks) {
  const plane = new Plane(new Vector3(0, 1, 0), 0), hit = new Vector3();
  let disposed = false, listening = false;
  let left: { unit: StagingPointerUnit; pointerId: number; x: number; y: number; active: boolean;
    offsetX: number; offsetZ: number; point: [number, number, number]; release: () => void } | null = null;
  let right: { unit: StagingPointerUnit; pointerId: number; x: number; y: number; moved: boolean;
    down: boolean; pending: StagingPointerUnit | null } | null = null;

  const unlisten = () => {
    if (!listening || typeof window === 'undefined') return;
    listening = false;
    window.removeEventListener('pointermove', trackRight, true);
    window.removeEventListener('pointerup', releaseRight, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('lostpointercapture', captureLost, true);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', escape);
  };
  const listen = () => {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('pointermove', trackRight, true);
    window.addEventListener('pointerup', releaseRight, true);
    window.addEventListener('pointercancel', cancel, true);
    // R3F clears its capture map without forwarding this native event to the
    // primitive. Listen on the DOM path so external capture loss also unlocks
    // OrbitControls when the pointer is subsequently released off-canvas.
    window.addEventListener('lostpointercapture', captureLost, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
  };
  function trackRight(event: PointerEvent) {
    if (right?.down && right.pointerId === event.pointerId
      && Math.hypot(event.clientX - right.x, event.clientY - right.y) >= 4) right.moved = true;
  }
  function releaseRight(event: PointerEvent) {
    if (!right?.down || right.pointerId !== event.pointerId) return;
    trackRight(event); right.down = false;
    const pending = right.pending;
    if (pending) {
      const inspect = !right.moved; right = null;
      if (inspect && !disposed) read().onInspect?.(pending);
    }
    if (!left) unlisten();
  }
  function cancel() {
    const drag = left; left = null; right = null; unlisten();
    if (!drag) return;
    drag.release(); read().onDraggingChange?.(false);
    if (drag.active) read().onDragEnd?.({ unitId: drag.unit.id, point: drag.point, cancelled: true });
  }
  function captureLost(event: PointerEvent) {
    if (left?.pointerId === event.pointerId || (right?.down && right.pointerId === event.pointerId)) cancel();
  }
  function escape(event: KeyboardEvent) { if (event.key === 'Escape') cancel(); }
  const point = (event: ThreeEvent<PointerEvent>, y: number): Vector3 | null => {
    plane.constant = -y;
    return event.ray.intersectPlane(plane, hit);
  };
  const updatePoint = (event: ThreeEvent<PointerEvent>) => {
    if (!left || !point(event, left.unit.planeY) || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return false;
    left.point[0] = hit.x + left.offsetX; left.point[1] = left.unit.planeY; left.point[2] = hit.z + left.offsetZ;
    return true;
  };

  return {
    handlers: {
      onPointerDown(event: ThreeEvent<PointerEvent>) {
        if (disposed || (event.button !== 0 && event.button !== 2)) return;
        const callbacks = read(), unit = callbacks.resolve(event);
        if (!unit) return;
        if (event.button === 2) {
          if (!callbacks.onInspect) return;
          right = { unit, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, down: true, pending: null };
          event.stopPropagation(); listen(); return;
        }
        if (!callbacks.canDrag() || !callbacks.onDragEnd || !Number.isFinite(unit.planeY)
          || !unit.center.every(Number.isFinite) || !point(event, unit.planeY)
          || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return;
        const target = event.target as (EventTarget & { setPointerCapture(id: number): void; releasePointerCapture(id: number): void }) | null;
        if (!target?.setPointerCapture) return;
        cancel();
        try { target.setPointerCapture(event.pointerId); } catch { return; }
        const release = () => { try { target.releasePointerCapture(event.pointerId); } catch { /* Already cancelled by the host. */ } };
        left = { unit, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false,
          offsetX: unit.center[0] - hit.x, offsetZ: unit.center[2] - hit.z,
          point: [unit.center[0], unit.planeY, unit.center[2]], release };
        event.stopPropagation(); callbacks.onSelect?.(unit.id); callbacks.onDraggingChange?.(true); listen();
      },
      onPointerMove(event: ThreeEvent<PointerEvent>) {
        if (!left || left.pointerId !== event.pointerId) return;
        event.stopPropagation();
        if (!read().canDrag()) { cancel(); return; }
        if (!updatePoint(event)) return;
        if (!left.active && Math.hypot(event.clientX - left.x, event.clientY - left.y) >= 4) {
          left.active = true; read().onDragStart?.({ unitId: left.unit.id, point: [...left.point] });
        }
        if (left.active) read().onDragMove?.({ unitId: left.unit.id, point: [...left.point] });
      },
      onPointerUp(event: ThreeEvent<PointerEvent>) {
        if (!left || left.pointerId !== event.pointerId) return;
        const validPoint = updatePoint(event), drag = left; left = null;
        event.stopPropagation(); drag.release(); read().onDraggingChange?.(false);
        if (!right?.down) unlisten();
        if (drag.active) read().onDragEnd?.({ unitId: drag.unit.id, point: drag.point,
          cancelled: !validPoint || !read().canDrag() });
      },
      onContextMenu(event: ThreeEvent<MouseEvent>) {
        if (disposed) return;
        const callbacks = read(), unit = callbacks.resolve(event);
        if (!unit || !callbacks.onInspect) return;
        event.stopPropagation(); event.nativeEvent?.preventDefault();
        if (event.delta > 4 || (right && (right.moved
          || Math.hypot(event.clientX - right.x, event.clientY - right.y) >= 4))) { right = null; if (!left) unlisten(); return; }
        // Chromium platforms emit contextmenu before or after pointerup. Defer
        // the former until release, so right-drag camera pan never opens details.
        if (right?.down) { right.pending = unit; return; }
        right = null; if (!left) unlisten(); callbacks.onInspect(unit);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    },
    cancel,
    activate() { disposed = false; },
    dispose() { cancel(); disposed = true; },
  };
}
