/**
 * Production presentation orchestration, driven exclusively by update(dt).
 * Plans and dock positions are caller decisions: this module never packs cargo,
 * validates transport, owns a renderer, or creates an animation loop.
 * World poses are {x,y,z,ry}, in scene units and radians; all times are seconds.
 * Without a custom adapter a stable ID must retain its Object3D between plans.
 * Default adapter parents must have uniform world scale and no shear; custom
 * adapters retain responsibility for any more general affine transforms.
 * Direct manual cargo matrices must be finite affine TRS and are synchronized
 * to their fields once at binding. Caller-managed world-update mode is rejected.
 * @typedef {import('./CargoMotion.d.ts').MotionId} MotionId
 * @typedef {import('./CargoMotion.d.ts').MotionPose} MotionPose
 * @typedef {import('./CargoMotion.d.ts').MotionUnit} MotionUnit
 * @typedef {import('./CargoMotion.d.ts').MotionPlan} MotionPlan
 * @typedef {import('./CargoMotion.d.ts').MotionRig} MotionRig
 * @typedef {import('./CargoMotion.d.ts').CargoMotionOptions} MotionOptions
 * @typedef {import('./CargoMotion.d.ts').MotionAdapter} MotionAdapter
 * @typedef {import('./CargoMotion.d.ts').ReplanResult} ReplanResult
 * @typedef {import('./cameraTween.js').CameraControls} CameraControls
 * @typedef {{from:MotionUnit[],to:MotionUnit[]}} Plans
 * @typedef {{at:number,run:()=>void,order:number}} PhaseJob
 * @typedef {{start:()=>void,reject:(reason?:unknown)=>void}} PendingRequest
 * @typedef {{type:string,result:ReplanResult,resolve:(result:ReplanResult)=>void}} Sequence
 * @typedef {typeof DEFAULT_MOTION_OPTIONS & MotionOptions & Record<string,any>} MotionConfig
 */
import { Box3, Euler, Quaternion, Vector3 } from 'three';
import { FlightManager } from './flights.js';
import { RigMoveManager } from './rigMoves.js';
import { CameraTween } from './cameraTween.js';
import { shortestAngleDelta } from './easing.js';

export const DEFAULT_MOTION_OPTIONS = Object.freeze({
  unloadArc: 1.2, unloadDuration: .6, unloadStagger: .035,
  leaveDuration: 1.2, arriveDuration: 1.4, rigOverlap: .3,
  loadStagger: .07, loadDuration: .8, doorLift: .4,
  replanStagger: .025, replanDuration: .8, replanArc: .8,
  cameraDuration: 1, cameraFrameMargin: 1.25,
});
/** @param {any} value */
const finitePoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
/** @param {any} value */
const finitePose = value => finitePoint(value) && Number.isFinite(value.ry);
/** @param {MotionPose} value @returns {MotionPose} */
const copyPose = value => ({ x: value.x, y: value.y, z: value.z, ry: value.ry });
/** @param {MotionId} id */
const validId = id => typeof id === 'string' ? id.length > 0 : typeof id === 'number' && Number.isFinite(id);
/** @param {MotionId} a @param {MotionId} b */
const lexical = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
/** @param {MotionPose} a @param {MotionPose} b */
const movedPose = (a, b) => Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6
  || Math.abs(a.z - b.z) > 1e-6 || Math.abs(shortestAngleDelta(a.ry, b.ry)) > 1e-6;

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

/** Public externally clocked cargo/rig/camera controller. */
export class CargoMotion {
  /**
   * options.adapter is optional for Mesh/Group cargo; custom adapters may bind
   * shared InstancedMesh instances and are never reparented by this class.
   * camera/controls may be omitted for a flight-only adapter consumer.
   * @param {{scene?:import('three').Object3D,camera?:import('three').Camera,controls?:CameraControls|null,
   * options?:MotionOptions & {initialRig?:MotionRig}}} args
   */
  constructor({ scene, camera, controls, options = {} } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.options = /** @type {MotionConfig} */ ({ ...options });
    for (const [key, fallback] of Object.entries(DEFAULT_MOTION_OPTIONS)) {
      const value = Reflect.get(options, key) ?? fallback;
      if (!Number.isFinite(value) || value < 0 || (key === 'cameraFrameMargin' && value <= 0)) throw new RangeError(`Invalid motion option: ${key}`);
      Reflect.set(this.options, key, value);
    }
    if (options.onInvalidate !== undefined && typeof options.onInvalidate !== 'function') throw new TypeError('onInvalidate must be a function');
    if (options.reducedMotion !== undefined && typeof options.reducedMotion !== 'boolean') throw new TypeError('reducedMotion must be boolean');
    this._customAdapter = options.adapter != null;
    if (options.adapter && (typeof options.adapter.getPose !== 'function' || typeof options.adapter.setPose !== 'function')) {
      throw new TypeError('Cargo adapter requires getPose/setPose');
    }
    if (!this._customAdapter && !scene?.isObject3D) throw new TypeError('Default cargo adapter requires a scene');
    /** @type {Map<MotionId,import('three').Object3D>} */ this._bindings = new Map();
    /** @type {Map<MotionId,import('three').Object3D|null>} */ this._parents = new Map();
    this._position = new Vector3(); this._localPosition = new Vector3();
    this._quaternion = new Quaternion(); this._parentQuaternion = new Quaternion(); this._euler = new Euler(0, 0, 0, 'YXZ');
    this._box = new Box3(); this._size = new Vector3(); this._center = new Vector3(); this._offset = new Vector3();
    this._rigPosition = new Vector3(); this._doorPoint = new Vector3();
    /** @type {MotionAdapter} */ this._adapter = options.adapter ?? {
      getPose: (id, output) => this._getObjectPose(id, output),
      setPose: (id, pose) => this._setObjectPose(id, pose),
    };
    this._flights = new FlightManager({ adapter: this._adapter });
    this._rigMoves = new RigMoveManager();
    /** @type {MotionRig|null} */ this._rig = options.rig ?? options.initialRig ?? null;
    if (this._rig) this._validateRig(this._rig);
    this._cameraTween = camera && controls ? new CameraTween({ camera, controls, onInvalidate: () => this._invalidate() }) : null;
    this._dockSlots = options.dockSlots;
    this._now = 0;
    /** @type {PhaseJob[]} */
    this._jobs = [];
    this._jobIndex = 0; this._jobSerial = 0;
    /** @type {Sequence|null} */ this._sequence = null;
    /** @type {Map<string,Set<(payload:any)=>void>>} */ this._listeners = new Map([['unitLanded', new Set()], ['sequenceDone', new Set()]]);
    /** @type {PendingRequest[]} */ this._pending = [];
    this._starting = false; this._draining = false; this._skipping = false; this._flushing = false;
    this._disposed = false; this._disposing = false;
    const matchMedia = globalThis.matchMedia ?? globalThis.window?.matchMedia;
    this._media = typeof matchMedia === 'function' ? matchMedia.call(globalThis.window ?? globalThis, '(prefers-reduced-motion: reduce)') : null;
    this._reduced = options.reducedMotion === true || this._media?.matches === true;
    this._onReduced = () => { this._reduced = options.reducedMotion === true || this._media?.matches === true; if (this._reduced) this.skip(); };
    if (this._media?.addEventListener) this._media.addEventListener('change', this._onReduced);
    else this._media?.addListener?.(this._onReduced);
  }

  /** @returns {boolean} Includes future phase jobs and queued public requests. */
  get isBusy() {
    return this._sequence !== null || this._pending.length > 0 || this._flights.isBusy()
      || this._rigMoves.isBusy || this._cameraTween?.isBusy === true;
  }

  /**
   * Unload nearest the actual rear door first, leave/arrive with overlap, then
   * load in the supplied toPlan order. No same-ID load precedes its unload.
   * Missing dock entries use that cargo's current world pose, not invented slots.
   * @param {{fromRig?:MotionRig|null,toRig:MotionRig,fromPlan:MotionPlan,toPlan:MotionPlan,dockSlots?:any}} args
   * @returns {Promise<{moved:number,added:number,removed:number}>}
   */
  switchTruck({ fromRig = null, toRig, fromPlan, toPlan, dockSlots = this._dockSlots }) {
    this._assertLive();
    const plans = this._validatePlans(fromPlan, toPlan);
    if (fromRig) this._validateRig(fromRig);
    this._validateRig(toRig);
    if ((!fromRig && plans.from.length) || fromRig?.root === toRig.root) throw new RangeError('Truck switch requires distinct source and target rigs');
    this._validateDocks(dockSlots, plans.from, plans.to);
    const before = new Set(plans.from.map(unit => unit.id)), after = new Set(plans.to.map(unit => unit.id));
    const result = { moved: plans.to.filter(unit => before.has(unit.id)).length,
      added: plans.to.filter(unit => !before.has(unit.id)).length, removed: plans.from.filter(unit => !after.has(unit.id)).length };
    return this._request('switchTruck', result, plans, () => {
      this._dockSlots = dockSlots;
      const start = this._now, duration = /** @param {keyof typeof DEFAULT_MOTION_OPTIONS} name */ name => this._reduced ? 0 : this.options[name];
      const dock = this._dockMap(dockSlots, plans.from, plans.to);
      const oldIds = new Set(plans.from.map(unit => unit.id));
      for (const unit of plans.to) if (!oldIds.has(unit.id)) this._placeAtDock(unit, dock.get(unit.id));
      toRig.root.visible = false;
      if (fromRig) fromRig.root.visible = true;
      const ordered = this._rearFirst(plans.from, fromRig);
      for (let index = 0; index < ordered.length; index++) {
        const unit = ordered[index];
        this._job(start + index * duration('unloadStagger'), () => this._fly(unit, dock.get(unit.id), 'unload',
          duration('unloadDuration'), this.options.unloadArc));
      }
      const unloaded = start + (ordered.length ? (ordered.length - 1) * duration('unloadStagger') + duration('unloadDuration') : 0);
      const leaveEnd = unloaded + (fromRig ? duration('leaveDuration') : 0);
      const arriveAt = fromRig ? Math.max(unloaded, leaveEnd - duration('rigOverlap')) : unloaded;
      const parkedAt = arriveAt + duration('arriveDuration');
      if (fromRig) this._job(unloaded, () => this._rigMoves.schedule({ rig: fromRig,
        x0: this._worldX(fromRig.root), x1: fromRig.offX, t0: this._now, d: duration('leaveDuration'), ease: 'in', hideAfter: true }));
      this._job(unloaded, () => this._frameRig(toRig, duration('cameraDuration')));
      this._job(arriveAt, () => this._rigMoves.schedule({ rig: toRig, x0: toRig.offX, x1: toRig.parkX,
        t0: this._now, d: duration('arriveDuration'), ease: 'out', onDone: () => { this._rig = toRig; } }));
      for (let index = 0; index < plans.to.length; index++) {
        const unit = plans.to[index];
        this._job(parkedAt + index * duration('loadStagger'), () => {
          const door = this._door(toRig);
          this._fly(unit, unit.pose, 'load', duration('loadDuration'), 0,
            { x: door.x, y: unit.pose.y + this.options.doorLift, z: door.z }, toRig.root);
        });
      }
    });
  }

  /**
   * Diff by stable ID and world pose epsilon. Unchanged cargo receives no setter.
   * Added cargo uses supplied dock slots (or its current pose); removed cargo
   * returns to those same caller-owned slots. Counts describe this supplied diff.
   * @param {{fromPlan:MotionPlan,toPlan:MotionPlan}} args
   * @returns {Promise<{moved:number,added:number,removed:number}>}
   */
  replan({ fromPlan, toPlan }) {
    this._assertLive();
    const plans = this._validatePlans(fromPlan, toPlan);
    this._validateDocks(this._dockSlots, plans.from, plans.to);
    const before = new Map(plans.from.map(unit => [unit.id, unit]));
    const after = new Map(plans.to.map(unit => [unit.id, unit]));
    const removed = plans.from.filter(unit => !after.has(unit.id));
    const added = plans.to.filter(unit => !before.has(unit.id));
    const moved = plans.to.filter(unit => { const previous = before.get(unit.id); return previous && movedPose(previous.pose, unit.pose); });
    const result = { moved: moved.length, added: added.length, removed: removed.length };
    return this._request('replan', result, plans, () => {
      const dock = this._dockMap(this._dockSlots, plans.from, plans.to);
      for (const unit of added) this._placeAtDock(unit, dock.get(unit.id));
      let index = 0;
      for (const unit of removed) this._job(this._now + index++ * this._time('replanStagger'), () =>
        this._fly(unit, dock.get(unit.id), 'removed', this._time('replanDuration'), this.options.replanArc));
      for (const unit of moved) this._job(this._now + index++ * this._time('replanStagger'), () =>
        this._fly(unit, unit.pose, 'replan', this._time('replanDuration'), this.options.replanArc, undefined,
          this._rig?.root ?? this._parents.get(unit.id)));
      for (const unit of added) this._job(this._now + index++ * this._time('replanStagger'), () => {
        const door = this._rig ? this._door(this._rig) : null;
        this._fly(unit, unit.pose, 'added', this._time('replanDuration'), this.options.replanArc,
          door ? { x: door.x, y: unit.pose.y + this.options.doorLift, z: door.z } : undefined,
          this._rig?.root ?? this._parents.get(unit.id));
      });
    });
  }

  /** Advance a monotonic clock; invalid/negative dt is ignored and long frames cap at .05s. @param {number} dt */
  update(dt) {
    if (this._disposed) return;
    const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(.05, dt) : 0;
    this._drain(this._now + elapsed);
    this._flushPending();
  }

  /** Start a camera-only overlap using the same clock. @param {import('./cameraTween.js').CameraDestination} destination @returns {boolean} */
  flyCameraTo(destination) {
    this._assertLive();
    return this._cameraTween?.flyTo({ ...destination,
      duration: this._reduced ? 0 : destination.duration ?? this.options.cameraDuration }, this._now) ?? false;
  }

  /** Finish every future phase chronologically, then snap all active systems. */
  skip() {
    if (this._disposed || this._skipping) return;
    this._skipping = true;
    try {
      const sequence = this._sequence;
      while (this._sequence === sequence && this._jobIndex < this._jobs.length) this._drain(Math.max(this._now, this._jobs[this._jobIndex].at), true);
      this._rigMoves.skip(); this._flights.skip(); this._cameraTween?.skip();
      this._checkDone(); this._invalidate();
    } finally { this._skipping = false; if (this._disposeRequested) this._cleanup(); }
    if (!this._starting && !this._draining) this._flushPending();
  }

  /** Landing events cover load/replan/added/removed, never the unload half of a truck switch.
   * @param {string} event @param {(payload:any)=>void} callback */
  on(event, callback) {
    this._assertLive();
    const listeners = this._listeners.get(event);
    if (!listeners || typeof callback !== 'function') throw new TypeError('Unknown cargo motion event or listener');
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  /** Final-snap and settle active work, remove listeners, and retain all caller model/renderer assets. */
  dispose() {
    if (this._disposed || this._disposing) return;
    this._disposing = true;
    if (this._skipping) { this._disposeRequested = true; return; }
    try { this.skip(); } finally { this._cleanup(); }
  }
  _cleanup() {
    if (this._disposed) return;
    this._disposed = true;
      this._flights.dispose(); this._rigMoves.dispose(); this._cameraTween?.dispose();
      if (this._media?.removeEventListener) this._media.removeEventListener('change', this._onReduced);
      else this._media?.removeListener?.(this._onReduced);
      for (const listeners of this._listeners.values()) listeners.clear();
      for (const pending of this._pending) pending.reject(new Error('CargoMotion is disposed'));
      this._pending.length = 0; this._bindings.clear(); this._parents.clear();
  }

  _assertLive() { if (this._disposed || this._disposing) throw new Error('CargoMotion is disposed'); }
  /** @param {keyof typeof DEFAULT_MOTION_OPTIONS} name @returns {number} */
  _time(name) { return this._reduced ? 0 : this.options[name]; }
  _invalidate() { if (this._disposed || this._disposing) return; try { this.options.onInvalidate?.(); } catch (error) { this.lastEventError = error; } }
  /** @param {string} name @param {any} payload */
  _emit(name, payload) {
    if (this._disposed || this._disposing) return;
    const listeners = this._listeners.get(name);
    if (!listeners) return;
    for (const callback of Array.from(listeners)) {
      if (this._disposed || this._disposing) break;
      try { callback(payload); } catch (error) { this.lastEventError = error; }
    }
  }
  /** @param {MotionRig} rig */
  _validateRig(rig) {
    if (!rig?.root?.isObject3D || !Array.isArray(rig.wheels) || rig.wheels.some(wheel => !wheel?.isObject3D || !Number.isFinite(wheel.rotation.z))
      || !Number.isFinite(rig.wheelRadius) || rig.wheelRadius <= 0 || !finitePoint(rig.doorPoint)
      || !Number.isFinite(rig.parkX) || !Number.isFinite(rig.offX)) throw new RangeError('Invalid cargo motion rig');
    if (rig.root.matrixWorldAutoUpdate === false) throw new RangeError('Moving rigs require matrixWorldAutoUpdate=true');
    for (let index = 0; index < rig.wheels.length; index++) {
      const wheel = rig.wheels[index];
      if (wheel.matrixWorldAutoUpdate === false || (!wheel.matrixAutoUpdate && !isTRSMatrix(wheel.matrix))) throw new RangeError('Moving rig wheels require TRS matrices and automatic world updates');
    }
    rig.root.updateWorldMatrix(true, false);
    if (!Number.isFinite(this._worldX(rig.root)) || !finitePoint(this._rigPosition)
      || (rig.root.parent && !Number.isFinite(rig.root.parent.matrixWorld.determinant()))
      || (rig.root.parent && rig.root.parent.matrixWorld.determinant() === 0)) throw new RangeError('Invalid rig world transform');
    if (!this._customAdapter) this._validateAttachment(rig.root);
  }
  /** @param {import('three').Object3D|null|undefined} parent */
  _validateAttachment(parent) {
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    const m = parent.matrixWorld.elements;
    const x = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const y = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
    const z = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
    const tolerance = Math.max(x, y, z) * 1e-8;
    if (!m.every(Number.isFinite) || Math.abs(m[3]) > 1e-10 || Math.abs(m[7]) > 1e-10 || Math.abs(m[11]) > 1e-10 || Math.abs(m[15] - 1) > 1e-10
      || x <= 0 || y <= 0 || z <= 0 || Math.abs(x - y) > tolerance || Math.abs(x - z) > tolerance
      || Math.abs(m[0] * m[4] + m[1] * m[5] + m[2] * m[6]) > tolerance
      || Math.abs(m[0] * m[8] + m[1] * m[9] + m[2] * m[10]) > tolerance
      || Math.abs(m[4] * m[8] + m[5] * m[9] + m[6] * m[10]) > tolerance) {
      throw new RangeError('Default cargo adapter requires uniform, nonsheared parent transforms');
    }
  }
  /** Validate before preempting any active sequence; custom adapters own all matrices.
   * @param {import('three').Object3D} object */
  _validateManualObject(object) {
    if (object.matrixWorldAutoUpdate === false) throw new RangeError('Default cargo adapter requires matrixWorldAutoUpdate=true');
    if (!object.matrixAutoUpdate && !isTRSMatrix(object.matrix)) throw new RangeError('Default cargo adapter requires finite affine TRS manual matrices without shear or perspective');
  }
  /** @param {MotionPlan} fromPlan @param {MotionPlan} toPlan @returns {Plans} */
  _validatePlans(fromPlan, toPlan) {
    if (!this._customAdapter) this._validateAttachment(this.scene);
    const objects = new Map(), byId = new Map();
    const read = /** @param {MotionPlan} plan */ plan => {
      if (!plan || !Array.isArray(plan.units)) throw new TypeError('Motion plan requires a units array');
      const ids = new Set();
      return plan.units.map(unit => {
        if (!unit || !validId(unit.id) || ids.has(unit.id) || !finitePose(unit.pose)
          || (unit.stop !== undefined && !Number.isFinite(unit.stop))) throw new RangeError('Motion plan requires unique IDs and finite poses');
        ids.add(unit.id);
        if (!this._customAdapter) {
          if (!unit.object3D?.isObject3D || (objects.has(unit.object3D) && objects.get(unit.object3D) !== unit.id)
            || (byId.has(unit.id) && byId.get(unit.id) !== unit.object3D)) throw new RangeError('Default motion IDs require one stable Object3D each');
          objects.set(unit.object3D, unit.id); byId.set(unit.id, unit.object3D);
          this._validateManualObject(unit.object3D);
          unit.object3D.updateWorldMatrix(true, false);
          this._validateAttachment(unit.object3D.parent);
          unit.object3D.getWorldPosition(this._position);
          if (!finitePoint(this._position)) throw new RangeError('Cargo world pose must be finite');
        } else {
          const current = { x: 0, y: 0, z: 0, ry: 0 };
          if (this._adapter.getPose(unit.id, current) === false || !finitePose(current)) throw new RangeError(`Cargo is not registered: ${String(unit.id)}`);
        }
        return { id: unit.id, object3D: unit.object3D, pose: copyPose(unit.pose), stop: unit.stop ?? 0 };
      });
    };
    return { from: read(fromPlan), to: read(toPlan) };
  }
  /** @param {any} slots @param {MotionUnit} unit @param {number} index @returns {any} */
  _dockValue(slots, unit, index) {
    if (slots == null) return undefined;
    if (slots instanceof Map) return slots.get(unit.id);
    if (Array.isArray(slots)) {
      const keyed = slots.find(value => value?.id === unit.id);
      if (keyed !== undefined) return keyed;
      const indexed = slots[index];
      return indexed?.id !== undefined && indexed.id !== unit.id ? undefined : indexed;
    }
    if (typeof slots === 'object') return Object.hasOwn(slots, unit.id) ? slots[unit.id] : undefined;
    throw new TypeError('Dock slots must be a Map, object or array');
  }
  /** @param {any} value @param {MotionPose} fallback @returns {MotionPose} */
  _parseDock(value, fallback) {
    if (value === undefined) return copyPose(fallback);
    const point = value?.pose ?? value;
    const result = Array.isArray(point) ? { x: point[0], y: point[1], z: point[2], ry: point[3] ?? fallback.ry }
      : { x: point?.x, y: point?.y, z: point?.z, ry: point?.ry ?? fallback.ry };
    if (!finitePose(result)) throw new RangeError('Dock poses must be finite');
    return result;
  }
  /** @param {any} slots @param {MotionUnit[]} from @param {MotionUnit[]} to */
  _validateDocks(slots, from, to) {
    for (const units of [from, to]) for (let index = 0; index < units.length; index++) this._parseDock(this._dockValue(slots, units[index], index), units[index].pose);
  }
  /** @param {any} slots @param {MotionUnit[]} from @param {MotionUnit[]} to @returns {Map<MotionId,MotionPose>} */
  _dockMap(slots, from, to) {
    const result = new Map();
    for (const units of [from, to]) for (let index = 0; index < units.length; index++) {
      const unit = units[index];
      if (!result.has(unit.id)) result.set(unit.id, this._parseDock(this._dockValue(slots, unit, index), this._readPose(unit.id)));
    }
    return result;
  }
  /** @param {string} type @param {ReplanResult} result @param {Plans} plans @param {()=>void} build @returns {Promise<ReplanResult>} */
  _request(type, result, plans, build) {
    return new Promise((resolve, reject) => {
      const start = () => {
        if (this._disposed || this._disposing) { reject(new Error('CargoMotion is disposed')); return; }
        this._starting = true;
        try {
          this.skip();
          this._bindings.clear(); this._parents.clear();
          if (!this._customAdapter) for (const unit of [...plans.from, ...plans.to]) {
            if (!this._bindings.has(unit.id) && !unit.object3D.matrixAutoUpdate) {
              unit.object3D.matrix.decompose(unit.object3D.position, unit.object3D.quaternion, unit.object3D.scale);
            }
            this._bindings.set(unit.id, unit.object3D);
            this._parents.set(unit.id, unit.object3D.parent);
          }
          this._jobs.length = 0; this._jobIndex = 0;
          this._sequence = { type, result, resolve };
          build(); this._jobs.sort((a, b) => a.at - b.at || a.order - b.order);
          this._drain(this._now); this._invalidate();
        } catch (error) {
          this._flights.clear(); this._rigMoves.clear(); this._jobs.length = 0;
          this._sequence = null; reject(error);
        } finally { this._starting = false; }
      };
      if (this._draining || this._skipping || this._starting || this._flushing) this._pending.push({ start, reject });
      else { start(); this._flushPending(); }
    });
  }
  _flushPending() {
    if (this._disposed || this._disposing || this._starting || this._draining || this._skipping || this._flushing) return;
    this._flushing = true;
    try {
      const count = this._pending.length;
      for (let index = 0; index < count; index++) this._pending.shift()?.start();
    } finally { this._flushing = false; }
  }
  /** @param {number} at @param {()=>void} run */
  _job(at, run) { this._jobs.push({ at, run, order: this._jobSerial++ }); }
  /** @param {number} now */
  _advance(now) {
    this._now = Math.max(this._now, now);
    this._rigMoves.update(this._now); this._flights.update(this._now); this._cameraTween?.update(this._now);
  }
  /** @param {number} target @param {boolean} [nested] */
  _drain(target, nested = false) {
    if (this._draining && !nested) return;
    const owning = !this._draining;
    this._draining = true;
    try {
      while (this._jobIndex < this._jobs.length && this._jobs[this._jobIndex].at <= target) {
        const job = this._jobs[this._jobIndex];
        this._advance(Math.max(this._now, job.at));
        if (this._jobs[this._jobIndex] !== job) continue;
        this._jobIndex++; job.run(); this._advance(this._now);
      }
      this._advance(target); this._checkDone();
      if (this.isBusy) this._invalidate();
    } finally { if (owning) this._draining = false; }
  }
  _checkDone() {
    if (!this._sequence || this._jobIndex < this._jobs.length || this._flights.isBusy()
      || this._rigMoves.isBusy || this._cameraTween?.isBusy) return;
    const sequence = this._sequence; this._sequence = null; this._jobs.length = 0; this._jobIndex = 0;
    sequence.resolve(sequence.result); this._emit('sequenceDone', { type: sequence.type, result: sequence.result });
  }
  /** @param {MotionId} id @returns {MotionPose} */
  _readPose(id) {
    const result = { x: 0, y: 0, z: 0, ry: 0 };
    if (this._adapter.getPose(id, result) === false || !finitePose(result)) throw new RangeError(`Cargo is not registered: ${String(id)}`);
    return result;
  }
  /** @param {MotionUnit} unit */
  _detach(unit) {
    if (!this._customAdapter && this.scene && unit.object3D.parent !== this.scene) this.scene.attach(unit.object3D);
  }
  /** @param {MotionUnit} unit @param {MotionPose|undefined} pose */
  _placeAtDock(unit, pose) {
    this._detach(unit);
    this._adapter.setPose(unit.id, pose ?? this._readPose(unit.id));
  }
  /** @param {MotionUnit} unit @param {MotionPose|undefined} to @param {string} phase @param {number} duration
   * @param {number} arc @param {{x:number,y:number,z:number}|undefined} [via]
   * @param {import('three').Object3D|null} [landParent] */
  _fly(unit, to, phase, duration, arc, via, landParent) {
    this._detach(unit);
    const a = { x: 0, y: 0, z: 0, ry: 0 };
    if (this._adapter.getPose(unit.id, a) === false || !finitePose(a)) {
      // A binding removed after validation must not strand future phase jobs.
      if (phase !== 'unload') this._emit('unitLanded', { id: unit.id, phase });
      return;
    }
    this._flights.schedule({ id: unit.id, a, b: to ?? a, via, arc, t0: this._now, d: duration, onDone: () => {
      if (!this._customAdapter && landParent?.isObject3D && !this._disposed) landParent.attach(unit.object3D);
      if (phase !== 'unload') this._emit('unitLanded', { id: unit.id, phase });
    } });
    this._flights.update(this._now);
  }
  /** @param {import('three').Object3D} object */
  _worldX(object) { object.getWorldPosition(this._rigPosition); return this._rigPosition.x; }
  /** @param {MotionRig} rig */
  _door(rig) { return rig.root.localToWorld(this._doorPoint.copy(rig.doorPoint)); }
  /** @param {MotionUnit[]} units @param {MotionRig|null} rig */
  _rearFirst(units, rig) {
    if (!rig) return units.slice();
    const door = this._door(rig), origin = rig.root.getWorldPosition(new Vector3());
    const direction = door.sub(origin); direction.y = 0;
    if (direction.lengthSq() < 1e-12) direction.set(1, 0, 0).applyQuaternion(rig.root.getWorldQuaternion(new Quaternion()));
    direction.normalize();
    const values = units.map(unit => ({ unit, pose: this._readPose(unit.id) }));
    return values.sort((a, b) => (b.pose.x - a.pose.x) * direction.x + (b.pose.z - a.pose.z) * direction.z
      || lexical(a.unit.id, b.unit.id)).map(value => value.unit);
  }
  /** @param {MotionRig} rig @param {number} duration */
  _frameRig(rig, duration) {
    const camera = /** @type {import('three').PerspectiveCamera|undefined} */ (this.camera);
    if (!this._cameraTween || !camera?.isPerspectiveCamera || !this.controls) return;
    this._box.setFromObject(rig.root, true);
    if (this._box.isEmpty()) return;
    const dx = rig.parkX - this._worldX(rig.root);
    this._box.min.x += dx; this._box.max.x += dx;
    this._box.getCenter(this._center); this._box.getSize(this._size);
    if (!finitePoint(this._center) || !finitePoint(this._size)) return;
    const halfVertical = camera.fov * Math.PI / 360;
    const halfAngle = Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * camera.aspect));
    const distance = this._size.length() / 2 / Math.sin(halfAngle) * this.options.cameraFrameMargin;
    if (!Number.isFinite(distance) || distance <= 0) return;
    this._offset.subVectors(camera.position, this.controls.target);
    if (this._offset.lengthSq() < 1e-12) this._offset.set(1, .6, 1);
    this._offset.normalize().multiplyScalar(distance).add(this._center);
    this._cameraTween.flyTo({ position: this._offset, target: this._center, duration }, this._now);
  }
  /** @param {MotionId} id @param {MotionPose} output */
  _getObjectPose(id, output) {
    const object = this._bindings.get(id);
    if (!object) return false;
    object.getWorldPosition(this._position); object.getWorldQuaternion(this._quaternion);
    this._euler.setFromQuaternion(this._quaternion, 'YXZ');
    output.x = this._position.x; output.y = this._position.y; output.z = this._position.z; output.ry = this._euler.y;
    return finitePose(output);
  }
  /** @param {MotionId} id @param {MotionPose} pose */
  _setObjectPose(id, pose) {
    const object = this._bindings.get(id);
    if (!object || !finitePose(pose)) return false;
    object.getWorldQuaternion(this._quaternion); this._euler.setFromQuaternion(this._quaternion, 'YXZ');
    this._euler.y = pose.ry; this._quaternion.setFromEuler(this._euler);
    this._localPosition.set(pose.x, pose.y, pose.z);
    if (object.parent) {
      object.parent.worldToLocal(this._localPosition);
      object.parent.getWorldQuaternion(this._parentQuaternion).invert(); this._quaternion.premultiply(this._parentQuaternion);
    }
    object.position.copy(this._localPosition); object.quaternion.copy(this._quaternion); object.updateMatrix(); object.updateWorldMatrix(false, true);
    return true;
  }
}

export default CargoMotion;
