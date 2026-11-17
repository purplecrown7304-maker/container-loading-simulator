/**
 * Externally clocked cargo motion. An adapter owns Mesh, Group or instance
 * bindings; this manager only writes reusable world poses in seconds/radians.
 * Flights are visual transitions, never collision or loading validation.
 *
 * @typedef {{x:number, y:number, z:number}} Point3
 * @typedef {Point3 & {ry:number}} Pose
 * @typedef {string|number} CargoId
 * @typedef {{getPose:(id:CargoId,outPose:Pose)=>boolean,
 *   setPose:(id:CargoId,pose:Pose)=>boolean}} FlightAdapter
 * @typedef {{id:CargoId,a:Pose,b:Pose,via?:Point3,arc?:number,t0:number,d:number,
 *   onDone?:(id:CargoId)=>void}} FlightRequest
 * @typedef {Omit<FlightRequest,'via'> & {via:Point3|null,arc:number,pose:Pose,
 *   deltaRy:number,arcScale:number,serial:number}} ActiveFlight
 */
import { clamp01, easeInOutCubic, shortestAngleDelta } from './easing.js';

/** @param {Point3} point */
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
/** @param {Pose} pose */
const finitePose = pose => finitePoint(pose) && Number.isFinite(pose.ry);
/** @param {Pose} pose @returns {Pose} */
const copyPose = pose => ({ x: pose.x, y: pose.y, z: pose.z, ry: pose.ry });

/** One clock owner may drive many cargo bindings without per-frame allocations. */
export class FlightManager {
  /** @param {{adapter?:FlightAdapter,onLanded?:(id:CargoId)=>void}} options */
  constructor({ adapter, onLanded } = {}) {
    if (!adapter || typeof adapter.getPose !== 'function' || typeof adapter.setPose !== 'function') {
      throw new TypeError('FlightManager requires getPose/setPose adapter functions');
    }
    if (onLanded !== undefined && typeof onLanded !== 'function') throw new TypeError('onLanded must be a function');
    this.adapter = adapter;
    this.onLanded = onLanded;
    /** @type {Map<CargoId,ActiveFlight>} */ this._flights = new Map();
    /** @type {ActiveFlight[]} */ this._active = [];
    this._serial = 0;
    this._passDepth = 0;
    this._dirty = false;
    this._disposed = false;
  }

  /**
   * Replacing an active ID starts from its current adapter pose. The cancelled
   * request receives no landing callback; the owner handles promise preemption.
   * A missing binding throws before replacing an existing request.
   * @param {FlightRequest} request @returns {FlightManager}
   */
  schedule(request) {
    if (this._disposed) throw new Error('FlightManager is disposed');
    if (!request || !((typeof request.id === 'string' && request.id.length > 0)
      || (typeof request.id === 'number' && Number.isFinite(request.id)))) throw new TypeError('Flight requires a cargo ID');
    if (!finitePose(request.a) || !finitePose(request.b) || (request.via !== undefined && !finitePoint(request.via))) {
      throw new RangeError('Flight endpoints and control point must be finite');
    }
    if (!Number.isFinite(request.t0) || !Number.isFinite(request.d) || request.d < 0
      || (request.arc !== undefined && !Number.isFinite(request.arc))) throw new RangeError('Flight timing and arc must be finite, with d >= 0');
    if (request.onDone !== undefined && typeof request.onDone !== 'function') throw new TypeError('onDone must be a function');
    const current = { x: 0, y: 0, z: 0, ry: 0 };
    if (this.adapter.getPose(request.id, current) === false) throw new RangeError(`Flight cargo is not registered: ${String(request.id)}`);
    if (!finitePose(current)) throw new RangeError('Current cargo pose must be finite');
    const interrupted = this._flights.has(request.id);
    const a = copyPose(interrupted ? current : request.a), b = copyPose(request.b);
    const flight = {
      id: request.id, a, b, via: request.via ? { x: request.via.x, y: request.via.y, z: request.via.z } : null,
      arc: request.arc ?? 0, t0: request.t0, d: request.d, onDone: request.onDone,
      pose: copyPose(a), deltaRy: shortestAngleDelta(a.ry, b.ry),
      arcScale: .6 + Math.min(1.4, Math.hypot(b.x - a.x, b.z - a.z) * .1), serial: ++this._serial,
    };
    this._flights.set(request.id, flight);
    this._active.push(flight);
    if (interrupted) this._dirty = true;
    if (!this._passDepth) this._compact();
    return this;
  }

  /** @returns {boolean} */
  isBusy() { return this._flights.size > 0; }
  /** @returns {number} */
  get size() { return this._flights.size; }

  /**
   * A removed binding completes its bookkeeping and callbacks once, without a
   * pose write succeeding. Requests scheduled by callbacks wait for the next
   * update; the current pass never consumes newly created work.
   * @param {number} nowSeconds @returns {FlightManager}
   */
  update(nowSeconds) {
    if (this._disposed) return this;
    if (!Number.isFinite(nowSeconds)) throw new RangeError('Flight clock must be finite seconds');
    const boundary = this._serial, count = this._active.length;
    let failure;
    this._passDepth++;
    try { for (let index = 0; index < count; index++) {
      const flight = this._active[index];
      if (!flight || flight.serial > boundary || this._flights.get(flight.id) !== flight) continue;
      // Scheduling owns no pose writes before the explicit start time.
      if (nowSeconds < flight.t0) continue;
      const progress = flight.d === 0 ? 1 : clamp01((nowSeconds - flight.t0) / flight.d), r = easeInOutCubic(progress);
      const pose = flight.pose, a = flight.a, b = flight.b;
      if (progress === 1) {
        pose.x = b.x; pose.y = b.y; pose.z = b.z; pose.ry = b.ry;
      } else if (progress === 0) {
        pose.x = a.x; pose.y = a.y; pose.z = a.z; pose.ry = a.ry;
      } else {
        const q = 1 - r, via = flight.via;
        if (via) {
          pose.x = q * q * a.x + 2 * q * r * via.x + r * r * b.x;
          pose.y = q * q * a.y + 2 * q * r * via.y + r * r * b.y;
          pose.z = q * q * a.z + 2 * q * r * via.z + r * r * b.z;
        } else {
          pose.x = q * a.x + r * b.x;
          pose.y = q * a.y + r * b.y + flight.arc * Math.sin(Math.PI * r) * flight.arcScale;
          pose.z = q * a.z + r * b.z;
        }
        pose.ry = a.ry + flight.deltaRy * r;
      }
      if (this.adapter.setPose(flight.id, pose) === false || progress === 1) {
        const error = this._finish(flight); failure ??= error;
      }
    } } finally { if (!--this._passDepth) this._compact(); }
    if (failure !== undefined) throw failure;
    return this;
  }

  /**
   * Snap requests active at entry to their exact endpoints. Callback-scheduled
   * requests remain pending, which keeps chained sequences bounded/reentrant.
   * @returns {FlightManager}
   */
  skip() {
    if (this._disposed) return this;
    const boundary = this._serial, count = this._active.length;
    let failure;
    this._passDepth++;
    try { for (let index = 0; index < count; index++) {
      const flight = this._active[index];
      if (!flight || flight.serial > boundary || this._flights.get(flight.id) !== flight) continue;
      const pose = flight.pose, b = flight.b;
      pose.x = b.x; pose.y = b.y; pose.z = b.z; pose.ry = b.ry;
      this.adapter.setPose(flight.id, pose);
      const error = this._finish(flight); failure ??= error;
    } } finally { if (!--this._passDepth) this._compact(); }
    if (failure !== undefined) throw failure;
    return this;
  }

  /** @param {CargoId} id @returns {boolean} */
  cancel(id) {
    const removed = this._flights.delete(id);
    if (removed) this._dirty = true;
    if (!this._passDepth) this._compact();
    return removed;
  }
  /** Cancel without landing callbacks. @returns {FlightManager} */
  clear() { this._flights.clear(); this._active.length = 0; this._dirty = false; return this; }
  /** Release requests without callbacks; the adapter and renderer remain owned by the caller. */
  dispose() { this.clear(); this._disposed = true; }

  _compact() {
    if (!this._dirty) return;
    let write = 0;
    for (let read = 0; read < this._active.length; read++) {
      const flight = this._active[read];
      if (this._flights.get(flight.id) === flight) this._active[write++] = flight;
    }
    this._active.length = write;
    this._dirty = false;
  }

  /** @param {ActiveFlight} flight */
  _finish(flight) {
    if (this._flights.get(flight.id) !== flight) return;
    this._flights.delete(flight.id);
    this._dirty = true;
    let failure;
    try { flight.onDone?.(flight.id); } catch (error) { failure = error; }
    try { this.onLanded?.(flight.id); } catch (error) { failure ??= error; }
    return failure;
  }
}

export default FlightManager;
