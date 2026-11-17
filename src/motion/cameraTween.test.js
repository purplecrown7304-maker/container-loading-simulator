import { describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraTween } from './cameraTween.js';

function setup({ enabled = true, camera = new PerspectiveCamera(60), damping = true, autoRotate = true } = {}) {
  camera.position.set(0, 0, 10);
  const listeners = new Map();
  const domElement = document.createElement('canvas');
  const controls = {
    target: new Vector3(), enabled, enableDamping: damping, autoRotate, domElement,
    update: vi.fn(),
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
  };
  const onInvalidate = vi.fn();
  const tween = new CameraTween({ camera, controls, onInvalidate });
  return { camera, controls, tween, onInvalidate, listeners, domElement };
}

function expectVector(actual, expected, precision = 10) {
  expected.forEach((value, index) => expect(actual.getComponent(index)).toBeCloseTo(value, precision));
}

describe('CameraTween', () => {
  it('interpolates target, spherical radius and FOV with exact endpoints', () => {
    const { camera, controls, tween, onInvalidate } = setup();
    const position = new Vector3(24, 0, 8);
    const target = new Vector3(4, 0, 8);
    expect(tween.flyTo({ position, target, fov: 80, duration: 2 }, 10)).toBe(true);
    expect(tween.isBusy).toBe(true);
    expectVector(camera.position, [0, 0, 10]);
    expect(controls.enabled).toBe(false);
    expect(controls.enableDamping).toBe(false);
    expect(controls.autoRotate).toBe(false);
    expect(tween.update(11)).toBe(true);
    expectVector(controls.target, [2, 0, 4]);
    expectVector(camera.position, [2 + 15 / Math.sqrt(2), 0, 4 + 15 / Math.sqrt(2)]);
    expect(camera.fov).toBe(70);
    expect(tween.update(12)).toBe(false);
    expect(camera.position.equals(position)).toBe(true);
    expect(controls.target.equals(target)).toBe(true);
    expect(camera.fov).toBe(80);
    expect(controls.enabled).toBe(true);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(true);
    expect(controls.update).toHaveBeenCalledTimes(3);
    expect(onInvalidate).toHaveBeenCalledTimes(3);
    tween.dispose();
  });

  it('takes the short azimuth route across the -PI/PI boundary', () => {
    const { camera, controls, tween } = setup();
    camera.position.setFromSpherical(new Spherical(10, Math.PI / 2, 170 * Math.PI / 180));
    const end = new Vector3().setFromSpherical(new Spherical(10, Math.PI / 2, -170 * Math.PI / 180));
    tween.flyTo({ position: end, target: [0, 0, 0], duration: 1 }, 0);
    tween.update(.5);
    expectVector(camera.position, [0, 0, -10]);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(10, 10);
    tween.update(1);
    expect(camera.position.equals(end)).toBe(true);
    tween.dispose();
  });

  it('uses the shared cubic ease and produces equal poses at equal clock times', () => {
    const a = setup();
    const b = setup();
    const request = { position: [10, 0, 0], target: [0, 0, 0], duration: 1 };
    a.tween.flyTo(request, 0);
    b.tween.flyTo(request, 0);
    a.tween.update(.25);
    for (let frame = 1; frame <= 15; frame += 1) b.tween.update(frame / 60);
    expectVector(a.camera.position, b.camera.position.toArray());
    const theta = new Spherical().setFromVector3(a.camera.position).theta;
    expect(theta).toBeCloseTo(Math.PI / 2 * .0625, 12);
    a.tween.dispose(); b.tween.dispose();
  });

  it('supersedes from the displayed pose and keeps the original controls state', () => {
    const { camera, controls, tween } = setup({ enabled: false, damping: false, autoRotate: false });
    tween.flyTo({ position: [10, 0, 0], target: [0, 0, 0], fov: 80, duration: 2 }, 0);
    tween.update(.5);
    const current = camera.position.clone();
    const currentFov = camera.fov;
    tween.flyTo({ position: [-10, 3, 0], target: [1, 2, 3], fov: 50, duration: 1 }, .5);
    expect(camera.position.equals(current)).toBe(true);
    expect(camera.fov).toBe(currentFov);
    tween.update(1.5);
    expectVector(camera.position, [-10, 3, 0]);
    expectVector(controls.target, [1, 2, 3]);
    expect(controls.enabled).toBe(false);
    expect(controls.enableDamping).toBe(false);
    expect(controls.autoRotate).toBe(false);
    tween.dispose();
  });

  it.each(['pointerdown', 'wheel', 'touchstart'])('cancels on %s before OrbitControls handles the same input', type => {
    const { camera, controls, tween, domElement } = setup();
    const states = [];
    domElement.addEventListener(type, () => states.push(controls.enabled));
    tween.flyTo({ position: [10, 0, 0], target: [0, 0, 0] }, 0);
    tween.update(.4);
    const current = camera.position.clone();
    const input = new Event(type, { cancelable: true, bubbles: true });
    domElement.dispatchEvent(input);
    expect(tween.isBusy).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(states).toEqual([true]);
    expect(input.defaultPrevented).toBe(false);
    tween.update(10);
    expect(camera.position.equals(current)).toBe(true);
    tween.dispose();
  });

  it('cancels on controls start while preserving original disabled state', () => {
    const { controls, tween, listeners } = setup({ enabled: false });
    tween.flyTo({ position: [10, 0, 0], target: [0, 0, 0] }, 0);
    listeners.get('start')();
    expect(tween.isBusy).toBe(false);
    expect(controls.enabled).toBe(false);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(true);
    tween.dispose();
  });

  it('snap/skip/cancel are exact, idempotent and release controls', () => {
    const { camera, controls, tween } = setup();
    const projection = vi.spyOn(camera, 'updateProjectionMatrix');
    tween.flyTo({ position: [1, 2, 3], target: [4, 5, 6], fov: 400, duration: 0 }, 0);
    expectVector(camera.position, [1, 2, 3]);
    expectVector(controls.target, [4, 5, 6]);
    expect(camera.fov).toBe(179);
    expect(projection).toHaveBeenCalledTimes(1);
    expect(tween.isBusy).toBe(false);
    expect(controls.enabled).toBe(true);
    tween.flyTo({ position: [-2, 5, 7], target: [1, 0, 2], fov: -1 }, 1);
    tween.skip(); tween.skip();
    expectVector(camera.position, [-2, 5, 7]);
    expect(camera.fov).toBe(1);
    expect(controls.enabled).toBe(true);
    tween.flyTo({ position: [6, 8, 9], target: [0, 0, 0], duration: -1 }, 1);
    expectVector(camera.position, [6, 8, 9]);
    expect(tween.isBusy).toBe(false);
    tween.cancel(); tween.dispose();
  });

  it('does not modify caller vectors and ignores FOV on an orthographic camera', () => {
    const camera = new OrthographicCamera();
    const { controls, tween } = setup({ camera });
    const updateProjection = vi.spyOn(camera, 'updateProjectionMatrix');
    const position = new Vector3(1, 2, 3);
    const target = new Vector3(4, 5, 6);
    tween.flyTo({ position, target, fov: 100 }, 0);
    tween.update(.5); tween.update(1);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(target.toArray()).toEqual([4, 5, 6]);
    expect(controls.target.equals(target)).toBe(true);
    expect(updateProjection).not.toHaveBeenCalled();
    expect('fov' in camera).toBe(false);
    tween.dispose();
  });

  it('ignores invalid requests and nonfinite/backwards clocks without corrupting a live motion', () => {
    const { camera, controls, tween } = setup();
    tween.flyTo({ position: [10, 0, 0], target: [0, 0, 0], duration: 1 }, 2);
    tween.update(2.5);
    const middle = camera.position.clone();
    const good = { position: [5, 4, 3], target: [1, 2, 3] };
    for (const request of [
      { ...good, position: [NaN, 1, 1] },
      { ...good, target: [1, Infinity, 1] },
      { ...good, position: [1e308, 1e308, 1e308] },
      { ...good, duration: Infinity },
      { ...good, fov: NaN },
      { ...good, position: [1, 2] },
    ]) expect(tween.flyTo(request, 2.5)).toBe(false);
    expect(tween.flyTo(good, NaN)).toBe(false);
    expect(tween.update(NaN)).toBe(true);
    expect(tween.update(Infinity)).toBe(true);
    tween.update(2.1);
    expect(camera.position.equals(middle)).toBe(true);
    tween.update(2.75);
    expectVector(camera.position, [10 * Math.sin(Math.PI / 2 * .9375), 0, 10 * Math.cos(Math.PI / 2 * .9375)]);
    tween.update(100);
    expectVector(camera.position, [10, 0, 0]);
    expectVector(controls.target, [0, 0, 0]);
    expect(tween.isBusy).toBe(false);
    tween.dispose();
  });

  it('keeps coincident endpoints and pole transitions finite', () => {
    const { camera, controls, tween } = setup();
    camera.position.set(0, 0, 0);
    tween.flyTo({ position: [0, 20, 0], target: [0, 0, 0] }, 0);
    for (let i = 0; i <= 10; i += 1) {
      tween.update(i / 10);
      expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
      expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
    }
    expectVector(camera.position, [0, 20, 0]);
    tween.flyTo({ position: [3, 4, 5], target: [3, 4, 5] }, 1);
    tween.update(1.5); tween.update(2);
    expectVector(camera.position, [3, 4, 5]);
    expectVector(controls.target, [3, 4, 5]);
    expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
    tween.dispose();
  });

  it('disposes all listeners once, restores controls and leaves caller resources alive', () => {
    const { camera, controls, tween, domElement, listeners } = setup();
    const remove = vi.spyOn(domElement, 'removeEventListener');
    tween.flyTo({ position: [10, 0, 0], target: [0, 0, 0] }, 0);
    tween.dispose(); tween.dispose();
    expect(tween.isBusy).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(true);
    expect(controls.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    expect(remove.mock.calls.map(call => call[0])).toEqual(['pointerdown', 'wheel', 'touchstart']);
    expect(remove.mock.calls.every(call => call[2] === true)).toBe(true);
    expect(tween.flyTo({ position: [1, 2, 3], target: [0, 0, 0] })).toBe(false);
    expect(tween.update(1)).toBe(false);
    expectVector(camera.position, [0, 0, 10]);
  });

  it('integrates with real OrbitControls without damping or auto-rotate drift', () => {
    const camera = new PerspectiveCamera(60);
    camera.position.set(0, 4, 10);
    const element = document.createElement('canvas');
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = true;
    controls.autoRotate = true;
    const tween = new CameraTween({ camera, controls });
    const position = new Vector3(8, 6, 3);
    const target = new Vector3(1, 2, 1);
    tween.flyTo({ position, target, fov: 45 }, 0);
    tween.update(.5);
    tween.update(1);
    expect(camera.position.equals(position)).toBe(true);
    expect(controls.target.equals(target)).toBe(true);
    expect(camera.fov).toBe(45);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(true);
    expect(controls.enabled).toBe(true);
    tween.dispose(); controls.dispose();
  });
});
