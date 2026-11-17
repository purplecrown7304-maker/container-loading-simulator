import { Vector3 } from 'three';
import { easeInCubic, easeOutCubic } from './easing.js';

/** @param {import('three').Matrix4} matrix @returns {boolean} */
function isTRSMatrix(matrix) {
  const m = matrix.elements;
  for (let index = 0; index < 16; index++) if (!Number.isFinite(m[index])) return false;
  if (Math.abs(m[3]) > 1e-10 || Math.abs(m[7]) > 1e-10 || Math.abs(m[11]) > 1e-10 || Math.abs(m[15] - 1) > 1e-10) return false;
  const x = Math.hypot(m[0], m[1], m[2]), y = Math.hypot(m[4], m[5], m[6]), z = Math.hypot(m[8], m[9], m[10]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && x > 0 && y > 0 && z > 0
    && Math.abs(m[0] / x * (m[4] / y) + m[1] / x * (m[5] / y) + m[2] / x * (m[6] / y)) <= 1e-8
    && Math.abs(m[0] / x * (m[8] / z) + m[1] / x * (m[9] / z) + m[2] / x * (m[10] / z)) <= 1e-8
    && Math.abs(m[4] / y * (m[8] / z) + m[5] / y * (m[9] / z) + m[6] / y * (m[10] / z)) <= 1e-8;
}

/**
 * @typedef {object} MovingRig
 * @property {import('three').Object3D} root
 * @property {readonly import('three').Object3D[]} wheels Wheels spin around their local Z axis.
 * @property {number} wheelRadius Positive scene units, matching root displacement.
 * @property {import('three').Vector3} doorPoint Local door point owned by the rig.
 * @property {number} parkX World X of the parked position.
 * @property {number} offX World X of the offscreen position.
 */
/**
 * @typedef {object} RigMoveOptions
 * @property {MovingRig} rig
 * @property {number} x0 Initial world X; an interrupted move uses its actual X.
 * @property {number} x1 Final world X.
 * @property {number} t0 Start time in seconds, in the caller's clock.
 * @property {number} d Nonnegative duration in seconds.
 * @property {'in'|'out'} [ease='out']
 * @property {boolean} [hideAfter=false]
 * @property {() => void} [onDone] Called once after the exact final pose is set.
 */
/** @typedef {RigMoveOptions & {id:number, index:number, from:number, to:number, ease:'in'|'out'}} RigMove */

/**
 * Production rig translation driven only by the caller's frame clock. It changes
 * presentation transforms, never cargo ownership, loading results or validation.
 * All poses use world X, so rotated/scaled parents retain the requested path.
 * Manual root matrices retain their linear part; manual wheels must be TRS.
 * Caller-managed matrixWorldAutoUpdate=false roots/wheels are not modified.
 * Reusable scratch vectors avoid per-frame Three object allocations.
 */
export class RigMoveManager {
  constructor() {
    /** @type {Map<import('three').Object3D, RigMove>} */
    this._moves = new Map();
    /** @type {RigMove[]} Stable ordered storage; frame loops create no iterators. */
    this._active = [];
    this._world = new Vector3();
    this._local = new Vector3();
    this._nextId = 0;
    this._disposed = false;
  }

  /** @returns {boolean} Includes scheduled moves whose start time is still future. */
  get isBusy() { return this._moves.size > 0; }

  /**
   * Replace this rig's current move continuously, without firing its old callback.
   * A new rig is placed at x0 without spinning wheels for that initial placement.
   * Invalid requests throw before replacing any active move or changing its pose.
   * @param {RigMoveOptions} options
   * @returns {RigMoveManager}
   */
  schedule(options) {
    if (this._disposed) throw new Error('RigMoveManager has been disposed');
    const { rig, x0, x1, t0, d, ease = 'out', hideAfter = false, onDone } = options;
    if (!rig?.root?.isObject3D || !Array.isArray(rig.wheels)
      || !Number.isFinite(rig.wheelRadius) || rig.wheelRadius <= 0
      || !Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(t0) || !Number.isFinite(d) || d < 0
      || (ease !== 'in' && ease !== 'out') || (onDone !== undefined && typeof onDone !== 'function')
      || !this._readWorld(rig.root)) throw new RangeError('Invalid rig move');
    for (let index = 0; index < rig.wheels.length; index++) {
      const wheel = rig.wheels[index];
      if (!wheel?.isObject3D || wheel.matrixWorldAutoUpdate === false
        || (wheel.matrixAutoUpdate ? !Number.isFinite(wheel.rotation.z) : !isTRSMatrix(wheel.matrix))) throw new RangeError('Invalid rig wheel matrix or world update mode');
    }
    const from = this._moves.has(rig.root) ? this._world.x : x0;
    if (!Number.isFinite(x1 - from) || !Number.isFinite((x1 - from) / rig.wheelRadius)
      || !this._setWorldX(rig.root, from)) throw new RangeError('Invalid rig move distance');
    for (let index = 0; index < rig.wheels.length; index++) {
      const wheel = rig.wheels[index];
      if (!wheel.matrixAutoUpdate) wheel.matrix.decompose(wheel.position, wheel.quaternion, wheel.scale);
    }
    const previous = this._moves.get(rig.root);
    if (previous) this._remove(previous);
    const move = { rig, x0, x1, t0, d, ease, hideAfter, onDone, from, to: x1, id: this._nextId++, index: this._active.length };
    rig.root.visible = true;
    this._moves.set(rig.root, move);
    this._active.push(move);
    if (d === 0) this._finish(move);
    return this;
  }

  /**
   * Advance scheduled poses. Invalid timestamps leave the last valid pose intact.
   * Completion callbacks may schedule another move; it starts on the next update.
   * @param {number} nowSeconds
   * @returns {boolean} Whether work remains after this frame.
   */
  update(nowSeconds) {
    if (this._disposed || !Number.isFinite(nowSeconds)) return this.isBusy;
    const limit = this._nextId;
    let index = 0;
    while (index < this._active.length) {
      const move = this._active[index];
      if (move.id >= limit) { index++; continue; }
      const progress = Math.max(0, Math.min(1, (nowSeconds - move.t0) / move.d));
      if (progress === 1) this._finish(move);
      else {
        const eased = move.ease === 'in' ? easeInCubic(progress) : easeOutCubic(progress);
        if (!this._advance(move, move.from + (move.to - move.from) * eased)) this._remove(move);
      }
      // Completion may remove/reorder jobs, clear the queue or schedule a new
      // request. Visit the next original job now occupying this same slot.
      if (this._active[index] === move) index++;
    }
    return this.isBusy;
  }

  /** Finish the moves scheduled now, with exact endpoints and one callback each. */
  skip() {
    if (this._disposed) return;
    const limit = this._nextId;
    let index = 0;
    while (index < this._active.length) {
      const move = this._active[index];
      if (move.id >= limit) { index++; continue; }
      this._finish(move);
      if (this._active[index] === move) index++;
    }
  }

  /** Cancel without changing current poses, visibility or invoking callbacks. */
  clear() { this._moves.clear(); this._active.length = 0; }

  /** Idempotently stop this manager; it does not own or dispose rig model assets. */
  dispose() { if (this._disposed) return; this.clear(); this._disposed = true; }

  /** @private @param {import('three').Object3D} root @returns {boolean} */
  _readWorld(root) {
    if (root.matrixWorldAutoUpdate === false) return false;
    root.getWorldPosition(this._world);
    if (!Number.isFinite(this._world.x) || !Number.isFinite(this._world.y) || !Number.isFinite(this._world.z)) return false;
    if (root.parent) {
      const determinant = root.parent.matrixWorld.determinant();
      if (!Number.isFinite(determinant) || determinant === 0) return false;
    }
    return true;
  }

  /** @private @param {import('three').Object3D} root @param {number} x @returns {boolean} */
  _setWorldX(root, x) {
    this._local.copy(this._world); this._local.x = x;
    if (root.parent) root.parent.worldToLocal(this._local);
    if (!Number.isFinite(this._local.x) || !Number.isFinite(this._local.y) || !Number.isFinite(this._local.z)) return false;
    root.position.copy(this._local);
    if (root.matrixAutoUpdate) root.updateMatrix();
    else { root.matrix.setPosition(this._local); root.matrixWorldNeedsUpdate = true; }
    return true;
  }

  /** @private @param {RigMove} move @param {number} x @returns {boolean} */
  _advance(move, x) {
    if (!Number.isFinite(x) || !Number.isFinite(move.rig.wheelRadius) || move.rig.wheelRadius <= 0 || !this._readWorld(move.rig.root)) return false;
    const dx = x - this._world.x;
    const turn = dx / move.rig.wheelRadius;
    if (!Number.isFinite(turn)) return false;
    const wheels = move.rig.wheels;
    for (let index = 0; index < wheels.length; index++) if (!Number.isFinite(wheels[index].rotation.z - turn)) return false;
    if (!this._setWorldX(move.rig.root, x)) return false;
    for (let index = 0; index < wheels.length; index++) {
      const wheel = wheels[index]; wheel.rotation.z -= turn;
      if (!wheel.matrixAutoUpdate) wheel.updateMatrix();
    }
    return true;
  }

  /** @private @param {RigMove} move */
  _finish(move) {
    if (this._moves.get(move.rig.root) !== move) return;
    const completed = this._advance(move, move.to);
    this._remove(move);
    if (!completed) return;
    if (move.hideAfter) move.rig.root.visible = false;
    move.onDone?.();
  }

  /** Remove in place while preserving callback order, without splice's array.
   * @private @param {RigMove} move */
  _remove(move) {
    if (this._moves.get(move.rig.root) !== move) return;
    this._moves.delete(move.rig.root);
    for (let index = move.index; index < this._active.length - 1; index++) {
      const next = this._active[index + 1]; this._active[index] = next; next.index = index;
    }
    this._active.pop();
  }
}
