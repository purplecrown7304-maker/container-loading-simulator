import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import type { unityPlan } from './unityProtocol';

export type ThreeComparisonPlan = ReturnType<typeof unityPlan>;
export type SceneBox = Pick<ThreeComparisonPlan['placements'][number], 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>;
export const UNITY_CARTON_SCALE = .99;

/** Engine axes are length X, width Y, height Z. Renderer axes match Rapier/Unity. */
export function sceneCenter(box: SceneBox, container: ThreeComparisonPlan['container']): [number, number, number] {
  return [box.x + box.length / 2 - container.length / 2, box.z + box.height / 2, box.y + box.width / 2 - container.width / 2];
}

export function sceneBoxMatrix(box: SceneBox, container: ThreeComparisonPlan['container'], inset = 1): Matrix4 {
  return new Matrix4().compose(new Vector3(...sceneCenter(box, container)), new Quaternion(), new Vector3(box.length * inset, box.height * inset, box.width * inset));
}

export function validScenePoses(poses: Float32Array, count: number): boolean {
  if (poses.length !== count * 7) return false;
  for (let i = 0; i < poses.length; i++) if (!Number.isFinite(poses[i])) return false;
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const q2 = poses[o + 3] ** 2 + poses[o + 4] ** 2 + poses[o + 5] ** 2 + poses[o + 6] ** 2;
    if (q2 < .0001) return false;
  }
  return true;
}

/** Validation is all-or-nothing: never apply cargo if the support half is invalid.
 * Frames have no engine plan ID, so the owner should supply frameRevision when it
 * has one. Object bindings also reject a retained frame from an earlier plan. */
export function acceptSceneFrame(plan: ThreeComparisonPlan, frame: InertiaAnimationFrame, bindings: WeakMap<InertiaAnimationFrame, number>, frameRevision?: number): boolean {
  if (frameRevision !== undefined && frameRevision !== plan.revision) return false;
  const boundRevision = bindings.get(frame);
  if (boundRevision !== undefined && boundRevision !== plan.revision) return false;
  if (!validScenePoses(frame.cargo, plan.placements.length) || !validScenePoses(frame.supports, plan.supports.length)) return false;
  bindings.set(frame, plan.revision);
  return true;
}

export function poseMatrix(poses: Float32Array, index: number, scale: Vector3, target = new Matrix4()): Matrix4 {
  const offset = index * 7;
  return target.compose(new Vector3(poses[offset], poses[offset + 1], poses[offset + 2]), new Quaternion(poses[offset + 3], poses[offset + 4], poses[offset + 5], poses[offset + 6]).normalize(), scale);
}

export function visibleCargoIndexes(plan: ThreeComparisonPlan, cut: number, step: number, weight: boolean): number[] {
  if (weight) return [];
  const limit = plan.container.height * Math.max(1, Math.min(100, cut)) / 100;
  return plan.placements.flatMap((box, index) => index < Math.max(0, step) && box.z < limit ? [index] : []);
}

/** Same equipment-corner fit used by CargoViewer, converted to Three camera axes. */
export function sceneCameraPose(plan: ThreeComparisonPlan, view: string, aspect: number) {
  const { length, width, height } = plan.container;
  const pitch = view === 'top' ? 89 : view === 'door' || view === 'rear' || view === 'side' ? 0 : 27;
  const yaw = view === 'top' ? 0 : view === 'door' || view === 'rear' ? -90 : view === 'side' ? 180 : 222;
  const target = new Vector3(0, height * .4, 0);
  const rotation = new Quaternion().setFromEuler(new Euler(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'));
  const inverse = rotation.clone().invert();
  const vertical = Math.tan(20 * Math.PI / 180), horizontal = vertical * Math.max(.1, aspect);
  let distance = .5;
  for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) {
    const p = new Vector3(x < 0 && plan.vehicle ? -length * .5 - width * 1.22 : x * length * .5, y * height, z * width * .5).sub(target).applyQuaternion(inverse);
    distance = Math.max(distance, Math.abs(p.x) / horizontal - p.z, Math.abs(p.y) / vertical - p.z);
  }
  distance *= 1.12;
  return { target, position: new Vector3(0, 0, -distance).applyQuaternion(rotation).add(target), distance };
}
