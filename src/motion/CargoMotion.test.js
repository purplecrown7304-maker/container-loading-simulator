// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { CargoMotion, DEFAULT_MOTION_OPTIONS } from './CargoMotion.js';

const pose = (x = 0, y = 0, z = 0, ry = 0) => ({ x, y, z, ry });
const plan = (...units) => ({ units });
const unit = (id, value = pose(), object3D = new Group()) => ({ id, object3D, pose: value, stop: 0 });
function rig(scene, offX = 12) {
  const root = new Group(), body = new Mesh(new BoxGeometry(4, 2, 2), new MeshBasicMaterial());
  root.add(body); scene.add(root); root.position.x = offX;
  return { root, wheels: [new Group()], wheelRadius: .5, doorPoint: new Vector3(2, 0, 0), parkX: 0, offX };
}
function custom(options = {}) {
  const poses = new Map([['a', pose()], ['b', pose()], ['c', pose()]]), writes = [];
  const adapter = {
    getPose(id, output) { const current = poses.get(id); if (!current) return false; Object.assign(output, current); return true; },
    setPose(id, value) { const current = poses.get(id); if (!current) return false; writes.push({ id, ...value }); Object.assign(current, value); return true; },
  };
  const motion = new CargoMotion({ scene: new Scene(), options: { adapter, ...options } });
  return { motion, poses, writes };
}
function finish(motion) {
  for (let frame = 0; frame < 1000 && motion.isBusy; frame++) motion.update(.05);
  expect(motion.isBusy).toBe(false);
}
afterEach(() => vi.unstubAllGlobals());

describe('CargoMotion production orchestration', () => {
  it('exports one frozen defaults source and leaves unchanged plans completely untouched', async () => {
    expect(Object.isFrozen(DEFAULT_MOTION_OPTIONS)).toBe(true); expect(DEFAULT_MOTION_OPTIONS.loadDuration).toBe(.8);
    const { motion, writes } = custom(), done = vi.fn(); motion.on('sequenceDone', done);
    const current = plan(unit('a'));
    await expect(motion.replan({ fromPlan: current, toPlan: current })).resolves.toEqual({ moved: 0, added: 0, removed: 0 });
    expect(writes).toHaveLength(0); expect(done).toHaveBeenCalledTimes(1); expect(motion.isBusy).toBe(false); motion.dispose();
  });
  it('opts into prepared vertical movement without changing the generic arc defaults', async () => {
    expect(DEFAULT_MOTION_OPTIONS.path).toBe('arc'); expect(DEFAULT_MOTION_OPTIONS.prepareDuration).toBe(0);
    const { motion, poses } = custom({ path: 'vertical', cruiseY: 6, liftHeight: 2, prepareDuration: .3, replanDuration: 1.5, dockSlots: { a: pose(0, -1, 2) } });
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(10, 0, 8, .4))) });
    for (let index = 0; index < 4; index++) motion.update(.05);
    expect(poses.get('a')).toEqual(pose(0, -1, 2));
    for (let index = 0; index < 6; index++) motion.update(.05);
    expect(poses.get('a').x).toBe(0); expect(poses.get('a').z).toBe(2); expect(poses.get('a').y).toBeGreaterThan(-1);
    for (let index = 0; index < 10; index++) motion.update(.05);
    expect(poses.get('a').y).toBe(6); expect(poses.get('a').x).toBeGreaterThan(0); expect(poses.get('a').x).toBeLessThan(10);
    for (let index = 0; index < 12; index++) motion.update(.05);
    expect(poses.get('a').x).toBe(10); expect(poses.get('a').z).toBe(8); expect(poses.get('a').y).toBeGreaterThan(0);
    motion.skip(); await pending; expect(poses.get('a')).toEqual(pose(10, 0, 8, .4)); motion.dispose();
  });
  it('includes preparation in the unload phase before letting the old truck depart', async () => {
    const { motion } = custom({ path: 'vertical', prepareDuration: .3, unloadDuration: 1 });
    const scene = new Scene(), old = rig(scene, -12), next = rig(scene); old.root.position.x = 0;
    const pending = motion.switchTruck({ fromRig: old, toRig: next, fromPlan: plan(unit('a')), toPlan: plan(unit('a', pose(2))), dockSlots: [pose(8)] });
    for (let index = 0; index < 21; index++) motion.update(.05);
    expect(old.root.position.x).toBe(0); expect(old.root.visible).toBe(true);
    for (let index = 0; index < 8; index++) motion.update(.05);
    expect(old.root.position.x).toBeLessThan(0); motion.skip(); await pending; motion.dispose();
  });
  it('drops preparation and every flight phase for reduced motion', async () => {
    const { motion, poses } = custom({ path: 'vertical', prepareDuration: .3, reducedMotion: true, dockSlots: { a: pose(8) } });
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(1))) });
    expect(motion.isBusy).toBe(false); expect(poses.get('a')).toEqual(pose(1)); await pending; motion.dispose();
  });
  it('diffs IDs, keeps added cargo at explicit docks synchronously and never moves the replan rig', async () => {
    const scene = new Scene(), active = rig(scene), { motion, poses, writes } = custom({ rig: active,
      dockSlots: new Map([['b', pose(20)], ['c', pose(30)]]) });
    Object.assign(poses.get('b'), pose(2)); Object.assign(poses.get('c'), pose(40));
    const landed = vi.fn(), done = vi.fn(); motion.on('unitLanded', landed); motion.on('sequenceDone', done);
    const pending = motion.replan({ fromPlan: plan(unit('a'), unit('b', pose(2))), toPlan: plan(unit('a', pose(5)), unit('c', pose(6))) });
    expect(motion.isBusy).toBe(true); expect(poses.get('c')).toEqual(pose(30));
    expect(active.root.position.x).toBe(12); expect(active.root.visible).toBe(true);
    finish(motion); await expect(pending).resolves.toEqual({ moved: 1, added: 1, removed: 1 });
    expect(poses.get('a')).toEqual(pose(5)); expect(poses.get('b')).toEqual(pose(20)); expect(poses.get('c')).toEqual(pose(6));
    expect(landed.mock.calls.map(call => call[0].phase)).toEqual(['removed', 'replan', 'added']);
    expect(done).toHaveBeenCalledTimes(1); expect(writes.length).toBeGreaterThan(3); expect(active.root.position.x).toBe(12); motion.dispose();
  });
  it('uses current world pose for missing keyed docks without stealing another ID slot', async () => {
    const { motion, poses } = custom({ dockSlots: [{ id: 'a', ...pose(20) }] });
    Object.assign(poses.get('b'), pose(7));
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('b', pose(2)), unit('a', pose(3))) });
    expect(poses.get('b')).toEqual(pose(7)); expect(poses.get('a')).toEqual(pose(20));
    motion.skip(); await pending; expect(poses.get('b')).toEqual(pose(2)); motion.dispose();
  });
  it('treats inherited record properties as missing docks for legitimate cargo IDs', async () => {
    const { motion, poses } = custom({ dockSlots: {} });
    poses.set('constructor', pose(7)); poses.set('toString', pose(8));
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('constructor', pose(1)), unit('toString', pose(2))) });
    expect(poses.get('constructor')).toEqual(pose(7)); expect(poses.get('toString')).toEqual(pose(8));
    motion.skip(); await pending; expect(poses.get('constructor')).toEqual(pose(1)); motion.dispose();
  });
  it('caps hidden-tab deltas, ignores invalid clock steps and preempts only after validating all new inputs', async () => {
    const { motion, poses } = custom(), target = plan(unit('a', pose(10)));
    const first = motion.replan({ fromPlan: plan(unit('a')), toPlan: target });
    motion.update(1000); expect(poses.get('a').x).toBeGreaterThan(0); expect(poses.get('a').x).toBeLessThan(1);
    const current = { ...poses.get('a') };
    motion.update(NaN); motion.update(-1); expect(poses.get('a')).toEqual(current);
    expect(() => motion.replan({ fromPlan: target, toPlan: plan(unit('a'), unit('a')) })).toThrow(/unique/);
    expect(motion.isBusy).toBe(true); expect(poses.get('a')).toEqual(current);
    const second = motion.replan({ fromPlan: target, toPlan: plan(unit('a', pose(20))) });
    await first; expect(poses.get('a').x).toBe(10); motion.skip(); await second; expect(poses.get('a').x).toBe(20); motion.dispose();
  });
  it('skips every future truck phase, emits only load landings and parks/attaches the real cargo', async () => {
    const scene = new Scene(), old = rig(scene, -12), next = rig(scene, 12); old.root.position.x = 0;
    const a = unit('a', pose(1), new Group()), b = unit('b', pose(3), new Group());
    old.root.add(a.object3D, b.object3D); a.object3D.position.x = 1; b.object3D.position.x = 3;
    const motion = new CargoMotion({ scene }), landed = vi.fn(), done = vi.fn(); motion.on('unitLanded', landed); motion.on('sequenceDone', done);
    const pending = motion.switchTruck({ fromRig: old, toRig: next, fromPlan: plan(a, b),
      toPlan: plan({ ...a, pose: pose(-1) }, { ...b, pose: pose(1) }), dockSlots: [pose(8), pose(9)] });
    expect(b.object3D.parent).toBe(scene); expect(a.object3D.parent).toBe(old.root);
    expect(motion.isBusy).toBe(true); motion.skip();
    await expect(pending).resolves.toEqual({ moved: 2, added: 0, removed: 0 });
    expect(old.root.visible).toBe(false); expect(next.root.visible).toBe(true); expect(next.root.position.x).toBe(0);
    expect(a.object3D.parent).toBe(next.root); expect(b.object3D.parent).toBe(next.root);
    expect(a.object3D.getWorldPosition(new Vector3()).x).toBeCloseTo(-1, 12);
    expect(landed).toHaveBeenCalledTimes(2); expect(landed.mock.calls.map(call => call[0].phase)).toEqual(['load', 'load']);
    expect(done).toHaveBeenCalledTimes(1); motion.skip(); expect(done).toHaveBeenCalledTimes(1); motion.dispose();
  });
  it('projects unload order toward a rotated actual local door and keeps unloaded cargo independent of old-rig departure', async () => {
    const scene = new Scene(), old = rig(scene, -12), next = rig(scene); old.root.position.x = 0; old.root.rotation.y = Math.PI;
    const a = unit('a', pose(-3), new Group()), b = unit('b', pose(-1), new Group());
    old.root.add(a.object3D, b.object3D); a.object3D.position.x = 3; b.object3D.position.x = 1;
    const motion = new CargoMotion({ scene });
    const pending = motion.switchTruck({ fromRig: old, toRig: next, fromPlan: plan(b, a), toPlan: plan(), dockSlots: { a: pose(8), b: pose(9) } });
    expect(a.object3D.parent).toBe(scene); expect(b.object3D.parent).toBe(old.root);
    for (let index = 0; index < 15; index++) motion.update(.05);
    expect(a.object3D.getWorldPosition(new Vector3()).x).toBeCloseTo(8, 12);
    expect(b.object3D.getWorldPosition(new Vector3()).x).toBeCloseTo(9, 12);
    motion.skip(); await pending; motion.dispose();
  });
  it('preserves transformed default-adapter parents and world scale through flight detachment/landing', async () => {
    const scene = new Scene(), parent = new Group(); parent.position.set(4, 1, -2); parent.rotation.y = .7; parent.scale.setScalar(2); scene.add(parent);
    const object = new Group(); object.position.set(1, 0, 2); parent.add(object);
    const start = object.getWorldPosition(new Vector3()), motion = new CargoMotion({ scene });
    const pending = motion.replan({ fromPlan: plan(unit('a', pose(start.x, start.y, start.z, .7), object)),
      toPlan: plan(unit('a', pose(2, 3, 4, .8), object)) });
    expect(object.parent).toBe(scene); motion.skip(); await pending;
    expect(object.parent).toBe(parent); const end = object.getWorldPosition(new Vector3());
    expect(end.distanceTo(new Vector3(2, 3, 4))).toBeLessThan(1e-10);
    const rotation = new Euler().setFromQuaternion(object.getWorldQuaternion(object.quaternion.clone()), 'YXZ'); expect(rotation.y).toBeCloseTo(.8, 12);
    expect(object.getWorldScale(new Vector3()).x).toBeCloseTo(2, 12); motion.dispose();
  });
  it('rejects nonuniform default-adapter parent chains before preempting valid work, while custom adapters remain unrestricted', async () => {
    const scene = new Scene(), parent = new Group(), a = new Group(), b = new Group();
    parent.scale.set(2, 1, 3); parent.rotation.y = .6; parent.add(b); b.rotation.y = .4; scene.add(parent, a);
    const motion = new CargoMotion({ scene });
    const pending = motion.replan({ fromPlan: plan(unit('a', pose(), a)), toPlan: plan(unit('a', pose(10), a)) });
    motion.update(.05); scene.updateWorldMatrix(true, true); const before = a.position.clone(), originalMatrix = b.matrixWorld.clone();
    expect(() => motion.replan({ fromPlan: plan(), toPlan: plan(unit('b', pose(5), b)) })).toThrow(/uniform/);
    expect(motion.isBusy).toBe(true); expect(a.position.equals(before)).toBe(true); expect(b.matrixWorld.equals(originalMatrix)).toBe(true);
    expect(b.parent).toBe(parent); motion.skip(); await pending; motion.dispose();
    const setup = custom({ rig: { root: parent, wheels: [], wheelRadius: 1, doorPoint: new Vector3(2, 0, 0), parkX: 0, offX: 10 } });
    const customPending = setup.motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(2), parent)) }); setup.motion.skip(); await customPending; setup.motion.dispose();
  });
  it.each(['skip', 'dispose'])('supports %s from a non-last landing callback without losing future jobs or promises', async action => {
    const { motion, poses } = custom(), landed = [];
    motion.on('unitLanded', event => { landed.push(event.id); if (landed.length === 1) motion[action](); });
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(1)), unit('b', pose(2)), unit('c', pose(3))) });
    finish(motion); await expect(pending).resolves.toEqual({ moved: 0, added: 3, removed: 0 });
    expect(poses.get('a')).toEqual(pose(1)); expect(poses.get('b')).toEqual(pose(2)); expect(poses.get('c')).toEqual(pose(3));
    if (action === 'skip') expect(landed).toEqual(['a', 'b', 'c']); else expect(landed).toEqual(['a']); motion.dispose();
  });
  it('queues callback preemption, settles the old sequence and completes the new accepted plan', async () => {
    const { motion, poses } = custom(), original = plan(unit('a', pose(1)), unit('b', pose(2))); let next;
    motion.on('unitLanded', () => { if (!next) next = motion.replan({ fromPlan: original, toPlan: plan(unit('a', pose(4)), unit('b', pose(5))) }); });
    const first = motion.replan({ fromPlan: plan(), toPlan: original });
    finish(motion); await first; await next;
    expect(poses.get('a')).toEqual(pose(4)); expect(poses.get('b')).toEqual(pose(5)); motion.dispose();
  });
  it('supports a busy switchTruck request from a landing callback without dropping either sequence', async () => {
    const { motion, poses } = custom(), scene = new Scene(), old = rig(scene, -12), nextRig = rig(scene);
    const original = plan(unit('a', pose(1)), unit('b', pose(2))); let next;
    motion.on('unitLanded', () => { if (!next) next = motion.switchTruck({ fromRig: old, toRig: nextRig, fromPlan: original,
      toPlan: plan(unit('a', pose(4)), unit('b', pose(5))), dockSlots: { a: pose(8), b: pose(9) } }); });
    const first = motion.replan({ fromPlan: plan(), toPlan: original });
    finish(motion); await first; await next;
    expect(poses.get('a')).toEqual(pose(4)); expect(poses.get('b')).toEqual(pose(5));
    expect(old.root.visible).toBe(false); expect(nextRig.root.position.x).toBe(0); motion.dispose();
  });
  it('isolates event errors, supports unsubscribe and completes removed external bindings', async () => {
    const { motion, poses } = custom(), ignored = vi.fn();
    motion.on('unitLanded', () => { throw new Error('listener failure'); }); const unsubscribe = motion.on('unitLanded', ignored); unsubscribe();
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(1)), unit('b', pose(2))) });
    poses.delete('a'); finish(motion); await pending;
    expect(ignored).not.toHaveBeenCalled(); expect(motion.lastEventError.message).toBe('listener failure'); motion.dispose();
  });
  it('settles IDs removed before their future phase starts and still completes the other cargo', async () => {
    const { motion, poses } = custom({ replanStagger: 2 }), landed = vi.fn(); motion.on('unitLanded', landed);
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(1)), unit('b', pose(2))) });
    poses.delete('b'); finish(motion); await pending;
    expect(poses.get('a')).toEqual(pose(1)); expect(landed.mock.calls.map(call => call[0].id)).toEqual(['a', 'b']); motion.dispose();
  });
  it('settles reduced motion without an update/RAF and cleans media listeners plus caller-owned resources', async () => {
    const listeners = new Set(), media = { matches: true, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    vi.stubGlobal('matchMedia', () => media);
    const { motion, poses } = custom(), pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(10)), unit('b', pose(20))) });
    expect(motion.isBusy).toBe(false); expect(poses.get('a')).toEqual(pose(10)); await pending;
    expect(listeners.size).toBe(1); motion.dispose(); expect(listeners.size).toBe(0);
    const scene = new Scene(), object = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), geometryDispose = vi.spyOn(object.geometry, 'dispose'), materialDispose = vi.spyOn(object.material, 'dispose'); scene.add(object);
    const second = new CargoMotion({ scene, options: { reducedMotion: true } });
    await second.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(2), object)) }); second.dispose();
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled(); expect(object.parent).toBe(scene);
  });
  it('supports explicit reduced-motion opt-in even when the operating system preference is false', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const { motion, poses } = custom({ reducedMotion: true });
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(5)), unit('b', pose(6))) });
    expect(motion.isBusy).toBe(false); expect(poses.get('a')).toEqual(pose(5)); expect(poses.get('b')).toEqual(pose(6)); await pending; motion.dispose();
  });
  it('dispose final-snaps active work, settles promises once and prevents later callbacks', async () => {
    const { motion, poses } = custom(), listener = vi.fn(); motion.on('unitLanded', listener);
    const pending = motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(10)), unit('b', pose(20))) });
    motion.update(.05); motion.dispose(); await pending;
    expect(poses.get('a')).toEqual(pose(10)); expect(poses.get('b')).toEqual(pose(20));
    expect(motion.isBusy).toBe(false); const calls = listener.mock.calls.length; motion.update(1); motion.skip(); motion.dispose(); expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('frames actual target-rig bounds at park without changing geometry and cleans camera controls', async () => {
    const scene = new Scene(), old = rig(scene, -12), next = rig(scene), camera = new PerspectiveCamera(50, 2, .1, 1000);
    old.root.position.x = 0; camera.position.set(10, 6, 10);
    const controls = { target: new Vector3(), enabled: false, enableDamping: true, update: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const original = Array.from(next.root.children[0].geometry.attributes.position.array);
    const motion = new CargoMotion({ scene, camera, controls });
    const pending = motion.switchTruck({ fromRig: old, toRig: next, fromPlan: plan(), toPlan: plan(), dockSlots: [] }); motion.skip(); await pending;
    expect(controls.target.distanceTo(new Vector3())).toBeLessThan(1e-10); expect(camera.position.length()).toBeGreaterThan(2);
    expect(Array.from(next.root.children[0].geometry.attributes.position.array)).toEqual(original);
    expect(controls.enabled).toBe(false); expect(controls.enableDamping).toBe(true); motion.dispose(); expect(controls.removeEventListener).toHaveBeenCalledTimes(1);
  });
  it('validates constructor rigs before registering any camera listeners', () => {
    const scene = new Scene(), camera = new PerspectiveCamera(), controls = { target: new Vector3(), enabled: true, update() {}, addEventListener: vi.fn() };
    expect(() => new CargoMotion({ scene, camera, controls, options: { rig: { ...rig(scene), wheelRadius: 0 } } })).toThrow(/rig/);
    expect(controls.addEventListener).not.toHaveBeenCalled();
  });
  it.each([false, true])('preserves direct manual cargo TRS and flags with fields synced=%s', async synced => {
    const scene = new Scene(), object = new Group(); scene.add(object);
    const initial = new Matrix4().compose(new Vector3(4, 2, 3), new Quaternion().setFromEuler(new Euler(.12, .6, .08, 'YXZ')), new Vector3(2, 3, 4));
    object.matrixAutoUpdate = false; object.matrix.copy(initial);
    if (synced) initial.decompose(object.position, object.quaternion, object.scale);
    object.matrixWorldNeedsUpdate = true; object.updateWorldMatrix(true, false, true);
    const decompose = vi.spyOn(object.matrix, 'decompose'), motion = new CargoMotion({ scene });
    const pending = motion.replan({ fromPlan: plan(unit('a', pose(4, 2, 3, .6), object)), toPlan: plan(unit('a', pose(10, 2, 3, .6), object)) });
    initial.elements.forEach((value, index) => expect(object.matrix.elements[index]).toBeCloseTo(value, 12));
    expect(decompose).toHaveBeenCalledOnce(); motion.update(.05); expect(decompose).toHaveBeenCalledOnce();
    motion.skip(); await pending;
    expect(object.getWorldPosition(new Vector3()).distanceTo(new Vector3(10, 2, 3))).toBeLessThan(1e-12);
    for (let index = 0; index < 12; index++) expect(object.matrix.elements[index]).toBeCloseTo(initial.elements[index], 12);
    const scale = object.getWorldScale(new Vector3()); expect(scale.x).toBeCloseTo(2); expect(scale.y).toBeCloseTo(3); expect(scale.z).toBeCloseTo(4);
    expect(object.parent).toBe(scene); expect(object.matrixAutoUpdate).toBe(false); expect(object.matrixWorldAutoUpdate).toBe(true); motion.dispose();
  });
  it('rejects unsupported manual cargo matrices before preemption and leaves custom adapters unrestricted', async () => {
    const scene = new Scene(), valid = new Group(); scene.add(valid);
    const motion = new CargoMotion({ scene });
    const pending = motion.replan({ fromPlan: plan(unit('a', pose(), valid)), toPlan: plan(unit('a', pose(10), valid)) });
    motion.update(.05); const current = valid.position.clone();
    const matrices = [new Matrix4().makeShear(.2, 0, 0, 0, 0, 0), new Matrix4().makeScale(0, 1, 1), new Matrix4()];
    matrices[2].elements[3] = .01;
    for (const matrix of matrices) {
      const bad = new Group(); scene.add(bad); bad.matrixAutoUpdate = false; bad.matrix.copy(matrix); bad.matrixWorldNeedsUpdate = true;
      const fields = [bad.position.toArray(), bad.quaternion.toArray(), bad.scale.toArray()];
      expect(() => motion.replan({ fromPlan: plan(), toPlan: plan(unit('b', pose(4), bad)) })).toThrow(/TRS/);
      expect(bad.matrix.equals(matrix)).toBe(true); expect([bad.position.toArray(), bad.quaternion.toArray(), bad.scale.toArray()]).toEqual(fields);
      expect(bad.matrixAutoUpdate).toBe(false); expect(valid.position.equals(current)).toBe(true); expect(motion.isBusy).toBe(true);
    }
    const externallyManaged = new Group(); externallyManaged.matrixWorldAutoUpdate = false;
    expect(() => motion.replan({ fromPlan: plan(), toPlan: plan(unit('b', pose(4), externallyManaged)) })).toThrow(/matrixWorldAutoUpdate/);
    expect(externallyManaged.matrixWorldAutoUpdate).toBe(false); expect(valid.position.equals(current)).toBe(true);
    const badRig = rig(scene); badRig.root.matrixWorldAutoUpdate = false;
    expect(() => motion.switchTruck({ toRig: badRig, fromPlan: plan(), toPlan: plan() })).toThrow(/matrixWorldAutoUpdate/);
    expect(badRig.root.matrixWorldAutoUpdate).toBe(false); expect(valid.position.equals(current)).toBe(true);
    motion.skip(); await pending; motion.dispose();
    const setup = custom(), manual = new Group(); manual.matrixAutoUpdate = false; manual.matrixWorldAutoUpdate = false; manual.matrix.copy(matrices[0]);
    const untouched = manual.matrix.clone();
    const customPending = setup.motion.replan({ fromPlan: plan(), toPlan: plan(unit('a', pose(4), manual)) }); setup.motion.skip(); await customPending;
    expect(setup.poses.get('a')).toEqual(pose(4)); expect(manual.matrix.equals(untouched)).toBe(true);
    expect(manual.matrixAutoUpdate).toBe(false); expect(manual.matrixWorldAutoUpdate).toBe(false); setup.motion.dispose();
  });
});
