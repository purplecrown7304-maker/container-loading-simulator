import { Box3, Matrix4, Vector3 } from 'three';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { poseMatrix, sceneBoxMatrix, type ThreeComparisonPlan } from './threeComparisonSceneState';

export type ClearanceAxis = 'length' | 'width' | 'height';
export type ClearanceSelection = { kind: 'cargo' | 'support'; index: number };
export type ClearanceFace = 'inner' | 'rear' | 'left' | 'right' | 'top' | 'bottom';
export type ClearanceMeasurement = {
  face: ClearanceFace; axis: ClearanceAxis; distanceM: number;
  from: [number, number, number]; to: [number, number, number];
};
export type CargoClearance = { selection: ClearanceSelection; measurements: ClearanceMeasurement[] };
const unitBounds = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));

/** Display only. Full physical dimensions, never the renderer's .99 carton inset.
 * Placement dimensions already include permitted orientation. Accepted replay poses
 * add the actual quaternion before the axis-aligned outer bounds are measured. */
export function selectedCargoClearance(plan: ThreeComparisonPlan, selection: ClearanceSelection | null, frame?: InertiaAnimationFrame): CargoClearance | null {
  if (!selection || !Number.isInteger(selection.index) || selection.index < 0) return null;
  const bodies = selection.kind === 'cargo' ? plan.placements : plan.supports;
  const body = bodies[selection.index];
  if (!body) return null;
  let matrix: Matrix4;
  if (frame) matrix = poseMatrix(selection.kind === 'cargo' ? frame.cargo : frame.supports, selection.index, new Vector3(body.length, body.height, body.width));
  else matrix = sceneBoxMatrix(body, plan.container);
  const bounds = unitBounds.clone().applyMatrix4(matrix), center = bounds.getCenter(new Vector3());
  if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return null;
  const { length, width, height } = plan.container;
  const face = (name: ClearanceFace, axis: ClearanceAxis, coordinate: 0 | 1 | 2, outer: number, boundary: number, sign: number): ClearanceMeasurement => {
    const from = center.toArray() as [number, number, number], to = [...from] as typeof from;
    from[coordinate] = outer; to[coordinate] = boundary;
    const distance = (boundary - outer) * sign;
    return { face: name, axis, distanceM: Math.abs(distance) < 1e-9 ? 0 : distance, from, to };
  };
  return { selection, measurements: [
    face('inner', 'length', 0, bounds.min.x, -length / 2, -1),
    face('rear', 'length', 0, bounds.max.x, length / 2, 1),
    // Looking from +X (rear) toward -X (inner), screen left is engine +Y = scene +Z.
    face('left', 'width', 2, bounds.max.z, width / 2, 1),
    face('right', 'width', 2, bounds.min.z, -width / 2, -1),
    face('top', 'height', 1, bounds.max.y, height, 1),
    face('bottom', 'height', 1, bounds.min.y, 0, -1),
  ] };
}

export function clearanceNumber(distanceM: number): string {
  const mm = distanceM * 1000;
  // Preserve sub-mm overflow instead of rounding it to a misleading zero.
  if (mm !== 0 && Math.abs(mm) < .1) return mm < 0 ? '−<0.1 mm' : '<0.1 mm';
  return `${mm < 0 ? '−' : ''}${Math.abs(mm).toFixed(1).replace(/\.0$/, '')} mm`;
}

export function clearanceFaceLabel(face: ClearanceFace, rearAccess?: 'door' | 'rear'): string {
  return { inner: '안쪽 경계', rear: rearAccess === 'door' ? '문쪽 경계' : '후면 경계',
    left: '왼쪽 경계', right: '오른쪽 경계', top: '상부 경계', bottom: '바닥' }[face];
}

/** Known enclosed box/reefer bodies have rear doors even when opening dimensions
 * are unrecorded. This is a direction label only: it never creates opening sizes.
 * Open equipment, unknown custom bodies and curtain bodies without door metadata
 * keep a neutral rear reference. */
export function equipmentRearAccess(equipment: { geometry: string; doorWidth?: number; doorHeight?: number }): 'door' | 'rear' {
  if (['flat-rack', 'platform', 'tank'].includes(equipment.geometry)) return 'rear';
  if (['closed', 'reefer', 'isotherm-truck', 'reefer-truck'].includes(equipment.geometry)) return 'door';
  return Number.isFinite(equipment.doorWidth) && equipment.doorWidth! > 0
    && Number.isFinite(equipment.doorHeight) && equipment.doorHeight! > 0 ? 'door' : 'rear';
}
