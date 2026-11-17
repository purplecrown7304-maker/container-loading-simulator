import { Spherical, Vector3 } from 'three';
import { easeInOutCubic, shortestAngleDelta } from './easing.js';

/** @typedef {import('three').Vector3 | readonly [number, number, number]} CameraPoint */
/**
 * @typedef {object} CameraControls
 * @property {import('three').Vector3} target
 * @property {boolean} enabled
 * @property {() => unknown} update
 * @property {boolean} [enableDamping]
 * @property {boolean} [autoRotate]
 * @property {HTMLElement | null} [domElement]
 * @property {(type:string, listener:() => void) => void} [addEventListener]
 * @property {(type:string, listener:() => void) => void} [removeEventListener]
 */
/**
 * @typedef {object} CameraDestination
 * @property {CameraPoint} position Camera position in the untransformed scene root.
 * @property {CameraPoint} target World look-at point.
 * @property {number} [fov] Perspective vertical FOV in degrees, clamped to [1, 179].
 * @property {number} [duration=1] Seconds; nonpositive durations snap immediately.
 */

/**
 * Externally clocked camera motion. It interpolates radius/polar/shortest azimuth
 * around a moving target, rather than cutting through it along a straight line.
 * The camera uses an untransformed parent and Y-up, matching OrbitControls and
 * Three's Spherical coordinates. This class owns no
 * renderer, requestAnimationFrame, DOM content, or loading/validation state.
 */
export class CameraTween {
  /**
   * @param {{camera:import('three').Camera, controls:CameraControls, onInvalidate?:() => void}} options
   */
  constructor({ camera, controls, onInvalidate }) {
    if (!camera?.position?.isVector3 || typeof camera.lookAt !== 'function'
      || !controls?.target?.isVector3 || typeof controls.update !== 'function'
      || (onInvalidate !== undefined && typeof onInvalidate !== 'function')) {
      throw new TypeError('CameraTween requires a camera and orbit controls');
    }
    this.camera = camera;
    this.controls = controls;
    this._invalidate = onInvalidate;
    this._fromPosition = new Vector3();
    this._toPosition = new Vector3();
    this._fromTarget = new Vector3();
    this._toTarget = new Vector3();
    this._requestedPosition = new Vector3();
    this._requestedTarget = new Vector3();
    this._position = new Vector3();
    this._target = new Vector3();
    this._offset = new Vector3();
    this._fromSpherical = new Spherical();
    this._toSpherical = new Spherical();
    this._spherical = new Spherical();
    this._thetaDelta = 0;
    this._fromFov = 0;
    this._toFov = 0;
    this._tweenFov = false;
    this._start = 0;
    this._duration = 0;
    this._now = 0;
    this._busy = false;
    this._disposed = false;
    this._originalEnabled = controls.enabled;
    this._originalDamping = controls.enableDamping;
    this._originalAutoRotate = controls.autoRotate;
    this._onInput = () => this.cancel();
    this._domElement = controls.domElement ?? null;
    controls.addEventListener?.('start', this._onInput);
    // Capture restores enabled before OrbitControls' bubble listener consumes the
    // same gesture. No event is prevented or stopped; keyboard events are untouched.
    this._domElement?.addEventListener('pointerdown', this._onInput, { capture: true, passive: true });
    this._domElement?.addEventListener('wheel', this._onInput, { capture: true, passive: true });
    this._domElement?.addEventListener('touchstart', this._onInput, { capture: true, passive: true });
  }

  /** @returns {boolean} */
  get isBusy() { return this._busy; }

  /**
   * Start or supersede from the currently displayed pose. The caller should pass
   * the same absolute seconds clock to flyTo and update; omitted time uses the
   * last update. Invalid input preserves the active motion and returns false.
   * @param {CameraDestination} destination
   * @param {number} [nowSeconds]
   * @returns {boolean}
   */
  flyTo(destination, nowSeconds = this._now) {
    if (this._disposed || !destination || !Number.isFinite(nowSeconds)) return false;
    const duration = destination.duration ?? 1;
    if (!Number.isFinite(duration)
      || (destination.fov !== undefined && !Number.isFinite(destination.fov))
      || !readPoint(destination.position, this._requestedPosition)
      || !readPoint(destination.target, this._requestedTarget)
      || !isFiniteVector(this.camera.position) || !isFiniteVector(this.controls.target)
      || !finiteDifference(this._requestedTarget, this.controls.target)
      || !finiteDifference(this._requestedPosition, this.camera.position)) return false;

    this._offset.subVectors(this.camera.position, this.controls.target);
    const fromRadius = this._offset.length();
    if (!Number.isFinite(fromRadius)) return false;
    this._offset.subVectors(this._requestedPosition, this._requestedTarget);
    const toRadius = this._offset.length();
    if (!Number.isFinite(toRadius)) return false;
    this._toSpherical.setFromVector3(this._offset);
    this._offset.subVectors(this.camera.position, this.controls.target);
    this._fromSpherical.setFromVector3(this._offset);
    // A coincident camera/target has no azimuth: borrow the other endpoint's
    // direction so expanding from radius zero does not introduce a spurious turn.
    if (fromRadius === 0) {
      this._fromSpherical.phi = this._toSpherical.phi;
      this._fromSpherical.theta = this._toSpherical.theta;
    }
    if (toRadius === 0) {
      this._toSpherical.phi = this._fromSpherical.phi;
      this._toSpherical.theta = this._fromSpherical.theta;
    }
    if (!this._busy) {
      this._originalEnabled = this.controls.enabled;
      this._originalDamping = this.controls.enableDamping;
      this._originalAutoRotate = this.controls.autoRotate;
    }
    this.controls.enabled = false;
    if (this._originalDamping !== undefined) this.controls.enableDamping = false;
    if (this._originalAutoRotate !== undefined) this.controls.autoRotate = false;
    this._fromPosition.copy(this.camera.position);
    this._fromTarget.copy(this.controls.target);
    this._toPosition.copy(this._requestedPosition);
    this._toTarget.copy(this._requestedTarget);
    this._thetaDelta = shortestAngleDelta(this._fromSpherical.theta, this._toSpherical.theta);
    const perspective = /** @type {import('three').PerspectiveCamera} */ (this.camera);
    this._tweenFov = perspective.isPerspectiveCamera === true
      && Number.isFinite(perspective.fov) && destination.fov !== undefined;
    this._fromFov = this._tweenFov ? perspective.fov : 0;
    this._toFov = this._tweenFov ? Math.max(1, Math.min(179, destination.fov ?? perspective.fov)) : 0;
    this._start = Math.max(this._now, nowSeconds);
    this._now = this._start;
    this._duration = Math.max(0, duration);
    this._busy = true;
    this._apply(this._duration === 0 ? 1 : 0);
    if (this._duration === 0) this._finish();
    this._invalidate?.();
    return true;
  }

  /**
   * Advance in absolute seconds. Invalid or backwards timestamps do not rewind.
   * Scratch vectors/spherical objects are reused; this path allocates none.
   * @param {number} nowSeconds
   * @returns {boolean} Whether motion remains after this frame.
   */
  update(nowSeconds) {
    if (this._disposed || !Number.isFinite(nowSeconds)) return this._busy;
    this._now = Math.max(this._now, nowSeconds);
    if (!this._busy) return false;
    const progress = Math.max(0, Math.min(1, (this._now - this._start) / this._duration));
    this._apply(progress);
    if (progress === 1) this._finish();
    this._invalidate?.();
    return this._busy;
  }

  /** Snap exactly to the accepted destination and release controls. */
  skip() {
    if (!this._busy || this._disposed) return;
    this._apply(1);
    this._finish();
    this._invalidate?.();
  }

  /** Stop at the currently displayed pose and release controls. */
  cancel() {
    if (!this._busy) return;
    this._finish();
    this._invalidate?.();
  }

  /** Release listeners and restore controls; never dispose caller-owned objects. */
  dispose() {
    if (this._disposed) return;
    this.cancel();
    this._disposed = true;
    this.controls.removeEventListener?.('start', this._onInput);
    this._domElement?.removeEventListener('pointerdown', this._onInput, true);
    this._domElement?.removeEventListener('wheel', this._onInput, true);
    this._domElement?.removeEventListener('touchstart', this._onInput, true);
  }

  /** @param {number} progress */
  _apply(progress) {
    const eased = easeInOutCubic(progress);
    if (progress === 0) {
      this._target.copy(this._fromTarget);
      this._position.copy(this._fromPosition);
    } else if (progress === 1) {
      this._target.copy(this._toTarget);
      this._position.copy(this._toPosition);
    } else {
      this._target.lerpVectors(this._fromTarget, this._toTarget, eased);
      this._spherical.set(
        this._fromSpherical.radius + (this._toSpherical.radius - this._fromSpherical.radius) * eased,
        this._fromSpherical.phi + (this._toSpherical.phi - this._fromSpherical.phi) * eased,
        this._fromSpherical.theta + this._thetaDelta * eased,
      );
      this._position.setFromSpherical(this._spherical).add(this._target);
    }
    this.camera.position.copy(this._position);
    this.controls.target.copy(this._target);
    if (this._tweenFov) {
      const perspective = /** @type {import('three').PerspectiveCamera} */ (this.camera);
      const fov = progress === 1 ? this._toFov : this._fromFov + (this._toFov - this._fromFov) * eased;
      if (perspective.fov !== fov) {
        perspective.fov = fov;
        perspective.updateProjectionMatrix();
      }
    }
    this.camera.lookAt(this._target);
    this.controls.update();
    // update clears OrbitControls' residual damping. Its configured orbit bounds
    // may adjust the pose; the requested tween pose remains exact for this frame.
    this.camera.position.copy(this._position);
    this.controls.target.copy(this._target);
    this.camera.lookAt(this._target);
  }

  _finish() {
    this._busy = false;
    this.controls.enabled = this._originalEnabled;
    if (this._originalDamping !== undefined) this.controls.enableDamping = this._originalDamping;
    if (this._originalAutoRotate !== undefined) this.controls.autoRotate = this._originalAutoRotate;
  }
}

/** @param {CameraPoint} value @param {Vector3} output @returns {boolean} */
function readPoint(value, output) {
  if (Array.isArray(value)) {
    if (value.length !== 3) return false;
    output.set(value[0], value[1], value[2]);
  } else if (value && /** @type {Vector3} */ (value).isVector3) {
    output.copy(/** @type {Vector3} */ (value));
  } else return false;
  return isFiniteVector(output);
}

/** @param {Vector3} value @returns {boolean} */
function isFiniteVector(value) {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/** @param {Vector3} a @param {Vector3} b @returns {boolean} */
function finiteDifference(a, b) {
  return Number.isFinite(a.x - b.x) && Number.isFinite(a.y - b.y) && Number.isFinite(a.z - b.z);
}

export default CameraTween;
