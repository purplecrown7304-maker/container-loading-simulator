import { cargoColor } from './cargoColors';
import type { ContainerSpec, LoadingResult } from './engine/types';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import type { SecuringUsage } from './inertiaCertification';
import { securingGeometry } from './unitySecuring';

export type UnitySceneOptions = { supports?: PhysicsSupport[]; securing?: SecuringUsage | null; geometry?: string };
export function unityPlan(container: ContainerSpec, result: LoadingResult, revision: number, cargo: Array<{ id: string; displayColor?: string }> = [], options: UnitySceneOptions = {}) {
  const colors = new Map(cargo.map(item => [item.id, item.displayColor]));
  const invalid = new Set(result.validationIssues.flatMap(issue => issue.placementIndexes));
  const analysis = analyzeWeightDistribution(container, result, 20, 8);
  return { revision, container: { length: container.length, width: container.width, height: container.height }, geometry: options.geometry ?? 'closed',
    placements: result.placements.map((p, i) => ({ ...p, color: cargoColor(p.cargoId, colors.get(p.cargoId)), invalid: invalid.has(i) })),
    supports: options.supports ?? [], decorations: securingGeometry(container, result.placements, options.supports ?? [], options.securing),
    cells: analysis.floor.cells, centerOfGravity: analysis.centerOfGravity,
  };
}
/** Rapier frames already use centered X, vertical Y and depth Z, in metres.
 * Keep quaternion components unchanged: both renderers apply q * vector * inverse(q).
 * Reject a partial/stale frame rather than pairing it with a different loading plan. */
export function unityFrame(frame: InertiaAnimationFrame, revision: number, cargoCount: number, supportCount: number) {
  if (frame.cargo.length !== cargoCount * 7 || frame.supports.length !== supportCount * 7) return null;
  const cargo = Array.from(frame.cargo), supports = Array.from(frame.supports);
  if (!cargo.every(Number.isFinite) || !supports.every(Number.isFinite)) return null;
  return { revision, cargo, supports };
}
export type UnityCommand = { action: 'cut' | 'shell' | 'step' | 'play' | 'select' | 'view' | 'weight' | 'cg' | 'labels'; value?: number; view?: string };
