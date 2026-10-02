import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { ContainerSpec, LoadingResult } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { createExternalStore } from './store/externalStore';

export type InertiaCanvasHost = { element: HTMLElement; container: ContainerSpec; result: LoadingResult; supports?: PhysicsSupport[] };
export type InertiaCanvasPlayback = { runId: number; target: PhysicsTarget; securing: SecuringUsage; frame?: InertiaAnimationFrame };
const hosts = createExternalStore<InertiaCanvasHost | null>(null);
const playback = createExternalStore<InertiaCanvasPlayback | null>(null);
let sequence = 0, retiredThrough = 0;
export function nextInertiaCanvasRunId() { return ++sequence; }
const sameBounds = (a: ContainerSpec, b: ContainerSpec) => [a.length, a.width, a.height].every(v => Number.isFinite(v) && v > 0)
  && a.length === b.length && a.width === b.width && a.height === b.height;
/** Adapters may clone results. Compare every ordered pose and mass when references
 * differ; counts alone cannot associate animation frames with a loading scene. */
export function inertiaHostMatchesTarget(host: InertiaCanvasHost | null, target: PhysicsTarget | undefined): boolean {
  if (!host || !target || !sameBounds(host.container, target.container)) return false;
  const hostPlacements = host.result.placements, targetPlacements = target.result.placements;
  if (hostPlacements !== targetPlacements && (hostPlacements.length !== targetPlacements.length || !hostPlacements.every((placement, i) => {
    const expected = targetPlacements[i];
    return placement.cargoId === expected.cargoId && Boolean(placement.rotated) === Boolean(expected.rotated)
      && ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => {
        const field = key as 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'weightKg';
        return Number.isFinite(placement[field]) && placement[field] === expected[field];
      });
  }))) return false;
  const a = host.supports ?? [], b = target.supports ?? [];
  return a.length === b.length && a.every((support, i) => ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => {
    const field = key as 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'weightKg';
    return Number.isFinite(support[field]) && support[field] === b[i][field];
  }));
}
export function registerInertiaCanvasHost(host: InertiaCanvasHost) {
  hosts.setSnapshot(host);
  if (!inertiaHostMatchesTarget(host, playback.getSnapshot()?.target)) clearInertiaCanvasPlayback();
  return () => {
    if (hosts.getSnapshot() !== host) return;
    hosts.setSnapshot(null); clearInertiaCanvasPlayback();
  };
}
export const readInertiaCanvasHost = hosts.getSnapshot;
export const useInertiaCanvasHost = hosts.useSnapshot;
export const readInertiaCanvasPlayback = playback.getSnapshot;
export const useInertiaCanvasPlayback = playback.useSnapshot;
export function publishInertiaCanvasPlayback(next: InertiaCanvasPlayback) {
  if (next.runId <= retiredThrough) return false;
  if (next.target !== readPhysicsTarget() || !inertiaHostMatchesTarget(hosts.getSnapshot(), next.target)) return false;
  const current = playback.getSnapshot();
  if (current && next.runId < current.runId) return false;
  playback.setSnapshot(next); return true;
}
export function clearInertiaCanvasPlayback() {
  retiredThrough = Math.max(retiredThrough, playback.getSnapshot()?.runId ?? 0);
  playback.setSnapshot(null);
}
