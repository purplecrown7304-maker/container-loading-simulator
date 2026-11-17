/**
 * Scalar easing for externally clocked motion. Inputs are normalized to [0, 1];
 * angles are radians. This module has no renderer or animation-loop ownership.
 */

/** @param {number} value @returns {number} */
export function clamp01(value) {
  return Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
}

/** @param {number} value @returns {number} */
export function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** @param {number} value @returns {number} */
export function easeInCubic(value) {
  const t = clamp01(value);
  return t * t * t;
}

/** @param {number} value @returns {number} */
export function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

/**
 * The shortest signed turn from a to b in [-PI, PI). A half-turn uses -PI.
 * @param {number} a @param {number} b @returns {number}
 */
export function shortestAngleDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const tau = Math.PI * 2;
  return ((b % tau - a % tau + Math.PI) % tau + tau) % tau - Math.PI;
}
