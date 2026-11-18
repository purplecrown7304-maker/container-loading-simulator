import type { Camera, Object3D, Vector3 } from 'three';

export type MotionId = string | number;
/** World-space position and Y-axis yaw, in the application's world units. */
export type MotionPose = { x: number; y: number; z: number; ry: number };
export type MotionUnit = { id: MotionId; object3D: Object3D; pose: MotionPose; stop: number };
export type MotionPlan = { units: readonly MotionUnit[] };
export type MotionRig = {
  root: Object3D; wheels: readonly Object3D[]; wheelRadius: number;
  /** Rear-door centre in root-local coordinates. */
  doorPoint: Vector3; parkX: number; offX: number;
};
export type MotionAdapter = {
  /** Write into the provided scratch pose; return false if the ID is absent. */
  getPose(id: MotionId, out: MotionPose): boolean;
  setPose(id: MotionId, pose: MotionPose): boolean;
};
export type DockSlots = ReadonlyMap<MotionId, MotionPose> | Readonly<Record<string, MotionPose>> | readonly MotionPose[];
export type ReplanResult = { moved: number; added: number; removed: number };
export type MotionCameraDestination = {
  position: Vector3 | readonly [number, number, number];
  target: Vector3 | readonly [number, number, number];
  fov?: number; duration?: number;
};
export type CargoMotionOptions = {
  adapter?: MotionAdapter; rig?: MotionRig; dockSlots?: DockSlots;
  onInvalidate?: () => void; reducedMotion?: boolean;
  unloadArc?: number; unloadDuration?: number; unloadStagger?: number;
  leaveDuration?: number; arriveDuration?: number; rigOverlap?: number;
  loadStagger?: number; loadDuration?: number; doorLift?: number;
  replanStagger?: number; replanDuration?: number; replanArc?: number;
  /** Legacy arc/Bézier remains the default; vertical holds X/Z during takeoff and landing. */
  path?: 'arc' | 'vertical';
  /** Minimum world cruise Y, additionally raised above endpoints by liftHeight. */
  cruiseY?: number; liftHeight?: number;
  ascentRatio?: number; descentRatio?: number;
  /** Source-pose hold before flight seconds; ignored for zero-duration/reduced motion. */
  prepareDuration?: number;
  cameraDuration?: number; cameraFrameMargin?: number;
};
export type UnitLandedEvent = { id: MotionId; phase: 'load' | 'replan' | 'added' | 'removed' };
export type SequenceDoneEvent = { type: 'switchTruck' | 'replan'; result: ReplanResult };
export const DEFAULT_MOTION_OPTIONS: Readonly<Required<Pick<CargoMotionOptions,
  'unloadArc' | 'unloadDuration' | 'unloadStagger' | 'leaveDuration' | 'arriveDuration' |
  'rigOverlap' | 'loadStagger' | 'loadDuration' | 'doorLift' | 'replanStagger' |
  'replanDuration' | 'replanArc' | 'cameraDuration' | 'cameraFrameMargin' |
  'path' | 'liftHeight' | 'ascentRatio' | 'descentRatio' | 'prepareDuration'>>>;

/** Externally clocked; creates no renderer, scene, DOM, packing, or RAF loop. */
export class CargoMotion {
  /** OrbitControls-compatible controls are needed only for camera motion. */
  constructor(args?: { scene?: Object3D; camera?: Camera; controls?: object | null; options?: CargoMotionOptions });
  readonly isBusy: boolean;
  update(dt: number): void;
  switchTruck(args: { fromRig: MotionRig; toRig: MotionRig; fromPlan: MotionPlan; toPlan: MotionPlan; dockSlots: DockSlots }): Promise<ReplanResult>;
  replan(args: { fromPlan: MotionPlan; toPlan: MotionPlan }): Promise<ReplanResult>;
  flyCameraTo(destination: MotionCameraDestination): boolean;
  skip(): void;
  on(event: 'unitLanded', callback: (event: UnitLandedEvent) => void): () => void;
  on(event: 'sequenceDone', callback: (event: SequenceDoneEvent) => void): () => void;
  dispose(): void;
}
export default CargoMotion;
