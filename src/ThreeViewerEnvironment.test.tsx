import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeViewerEnvironment from './ThreeViewerEnvironment';

const { runtime, factory } = vi.hoisted(() => ({ runtime: { scene: null as unknown, camera: null as unknown, invalidate: vi.fn() }, factory: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useThree: () => runtime, useFrame: vi.fn() }));
vi.mock('./threeViewerEnvironmentResources', () => ({ createViewerEnvironmentResources: factory }));

let root: Root, host: HTMLDivElement, scene: THREE.Scene;
const allocations: { root: THREE.Group; background: THREE.Color; dispose: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  allocations.length = 0; factory.mockReset(); runtime.invalidate.mockClear();
  scene = new THREE.Scene(); runtime.scene = scene; runtime.camera = new THREE.PerspectiveCamera();
  factory.mockImplementation(() => {
    const value = { root: new THREE.Group(), background: new THREE.Color('#abcdef'), dispose: vi.fn(), updateCamera: vi.fn() };
    allocations.push(value); return value;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('background resource lifecycle', () => {
  it('replaces and releases only decoration while keeping the scene and cargo intact', () => {
    const cargo = new THREE.Group(), initialBackground = new THREE.Color('#112233');
    cargo.position.set(1, 2, 3); scene.add(cargo); scene.background = initialBackground;
    const status = vi.fn();
    act(() => root.render(<ThreeViewerEnvironment id="forest" length={6} width={2.4} height={2.6} onStatus={status} />));
    const first = allocations[0];
    expect(scene.children).toEqual([cargo, first.root]);
    act(() => root.render(<ThreeViewerEnvironment id="space" length={6} width={2.4} height={2.6} onStatus={status} />));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toEqual([cargo, allocations[1].root]);
    expect(cargo.position.toArray()).toEqual([1, 2, 3]);
    expect(status).toHaveBeenLastCalledWith({ id: 'space', status: 'ready' });
    act(() => root.render(null));
    expect(allocations[1].dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toEqual([cargo]);
    expect(scene.background).toBe(initialBackground);
  });

  it('keeps a simple background and cargo usable after failure, then retries locally', () => {
    const cargo = new THREE.Group(), status = vi.fn(); scene.add(cargo);
    factory.mockImplementationOnce(() => { throw new Error('decorative allocation failed'); });
    act(() => root.render(<ThreeViewerEnvironment id="beach" length={6} width={2.4} height={2.6} onStatus={status} />));
    expect(scene.children).toEqual([cargo]);
    expect(status).toHaveBeenLastCalledWith({ id: 'beach', status: 'fallback' });
    act(() => root.render(<ThreeViewerEnvironment id="beach" length={6} width={2.4} height={2.6} attempt={1} onStatus={status} />));
    expect(scene.children).toEqual([cargo, allocations[0].root]);
    expect(status).toHaveBeenLastCalledWith({ id: 'beach', status: 'ready' });
  });

  it('balances all allocations under StrictMode, rapid switches and unmount', () => {
    for (const id of ['warehouse', 'forest', 'beach', 'space', 'warehouse'] as const) {
      act(() => root.render(<StrictMode><ThreeViewerEnvironment id={id} length={6} width={2.4} height={2.6} /></StrictMode>));
      expect(scene.children).toHaveLength(1);
    }
    act(() => root.render(null));
    expect(scene.children).toHaveLength(0);
    for (const allocation of allocations) expect(allocation.dispose).toHaveBeenCalledTimes(1);
  });
});
