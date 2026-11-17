/**
 * Frame-rate independent exponential damping in seconds. Nonpositive/invalid dt
 * makes no progress; nonpositive tau snaps, and invalid tau uses 0.1 seconds.
 * Invalid inputs never propagate NaN into a scene transform.
 * @param {number} current
 * @param {number} target
 * @param {number} [tau=0.1] Time constant in seconds.
 * @param {number} [dt=0] Elapsed seconds; the frame owner applies its own dt cap.
 * @returns {number}
 */
export function damp(current, target, tau = 0.1, dt = 0) {
  if (!Number.isFinite(target)) return Number.isFinite(current) ? current : 0;
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(dt) || dt <= 0) return current;
  const duration = Number.isFinite(tau) ? tau : 0.1;
  if (duration <= 0) return target;
  const alpha = -Math.expm1(-dt / duration);
  return current * (1 - alpha) + target * alpha;
}

/**
 * Damp three coordinates in place without creating a Vector3 or mutating target.
 * @param {import('three').Vector3} vector
 * @param {import('three').Vector3} target
 * @param {number} [tau=0.1]
 * @param {number} [dt=0]
 * @returns {import('three').Vector3} The original vector.
 */
export function damp3(vector, target, tau = 0.1, dt = 0) {
  vector.set(damp(vector.x, target.x, tau, dt), damp(vector.y, target.y, tau, dt), damp(vector.z, target.z, tau, dt));
  return vector;
}
