export type CameraPoint = readonly [number, number, number];
export type CameraMotionPose = { position: CameraPoint; target: CameraPoint };
export type CameraMotion = { from: CameraMotionPose; to: CameraMotionPose; startedAt: number; durationMs: number };
/** Our explicit-view transition duration, not a measurement of another site. */
export const CAMERA_VIEW_TRANSITION_MS = 375;

export function cameraMotionEase(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCameraMotion(from: CameraMotionPose, to: CameraMotionPose, startedAt: number, durationMs = CAMERA_VIEW_TRANSITION_MS): CameraMotion {
  if (![...from.position, ...from.target, ...to.position, ...to.target, startedAt, durationMs].every(Number.isFinite) || durationMs <= 0) throw new Error('Invalid camera motion');
  const copy = (pose: CameraMotionPose): CameraMotionPose => ({ position: [...pose.position], target: [...pose.target] });
  return { from: copy(from), to: copy(to), startedAt, durationMs };
}

export function sampleCameraMotion(motion: CameraMotion, now: number): CameraMotionPose & { complete: boolean; progress: number } {
  const progress = Math.max(0, Math.min(1, (now - motion.startedAt) / motion.durationMs));
  const eased = cameraMotionEase(progress);
  const interpolate = (from: CameraPoint, to: CameraPoint): [number, number, number] => progress === 1 ? [...to] : [0, 1, 2].map(axis => from[axis] + (to[axis] - from[axis]) * eased) as [number, number, number];
  return { position: interpolate(motion.from.position, motion.to.position), target: interpolate(motion.from.target, motion.to.target), progress, complete: progress === 1 };
}

/** Cargo, selection and label data are intentionally absent from this policy. */
export function cameraFitAction(previous: { physical: string; request: string } | null, next: { physical: string; request: string }, options: { staging: boolean; reducedMotion: boolean; instant: boolean }): 'skip' | 'instant' | 'animate' {
  if (previous?.physical === next.physical && previous.request === next.request) return 'skip';
  if (!previous || previous.physical !== next.physical || !options.staging || options.reducedMotion || options.instant) return 'instant';
  return 'animate';
}
