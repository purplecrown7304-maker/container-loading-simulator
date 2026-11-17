import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeRenderPipeline, { withOpaqueAOGBuffer, type RenderPipelineStatus, type ThreeRenderPipelineProps } from './ThreeRenderPipeline';

const harness = vi.hoisted(() => ({
  runtime: {} as Record<string, unknown>, frame: undefined as ((state: unknown, delta: number) => void) | undefined,
  priority: 0, composers: [] as any[], renderPasses: [] as any[], aoPasses: [] as any[], outputPasses: [] as any[],
  throwAllocation: false, throwAO: false, opaqueCapture: [] as boolean[],
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => harness.runtime,
  useFrame: (callback: (state: unknown, delta: number) => void, priority: number) => { harness.frame = callback; harness.priority = priority; },
}));
vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    passes: any[] = [];
    renderTarget1 = { samples: 0 }; renderTarget2 = { samples: 0 };
    constructor(public renderer: THREE.WebGLRenderer) { harness.composers.push(this); }
    addPass = vi.fn((pass: unknown) => this.passes.push(pass));
    setSize = vi.fn(); setPixelRatio = vi.fn(); dispose = vi.fn();
    render = vi.fn((delta: number) => this.passes.forEach(pass => pass.render(this.renderer, null, null, delta, false)));
  },
}));
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    constructor(public scene: THREE.Scene, public camera: THREE.Camera) { harness.renderPasses.push(this); }
    dispose = vi.fn();
    render = vi.fn((renderer: THREE.WebGLRenderer) => renderer.render(this.scene, this.camera));
  },
}));
vi.mock('three/addons/postprocessing/GTAOPass.js', () => ({
  GTAOPass: class {
    static OUTPUT = { Default: 0 };
    output = 0; blendIntensity = 1;
    gtaoMaterial = { dispose: vi.fn() }; blendMaterial = { dispose: vi.fn() };
    constructor(public scene: THREE.Scene, public camera: THREE.Camera) { harness.aoPasses.push(this); }
    updateGtaoMaterial = vi.fn(); updatePdMaterial = vi.fn(); setSize = vi.fn(); dispose = vi.fn();
    render(renderer: THREE.WebGLRenderer) {
      harness.opaqueCapture = this.scene.children.map(object => object.visible);
      this.scene.overrideMaterial = new THREE.MeshNormalMaterial();
      if (harness.throwAO) {
        renderer.autoClear = false; renderer.setClearColor('#ff0000', 0);
        renderer.setRenderTarget({ brokenPass: true } as unknown as THREE.WebGLRenderTarget);
        throw new Error('AO render failed');
      }
      renderer.render(this.scene, this.camera);
    }
  },
}));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    constructor() { if (harness.throwAllocation) throw new Error('Output allocation failed'); harness.outputPasses.push(this); }
    dispose = vi.fn(); render = vi.fn();
  },
}));

let root: Root, host: HTMLDivElement, scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let dpr: number, target: THREE.WebGLRenderTarget | null, clearColor: THREE.Color, clearAlpha: number;
let onStatus: ReturnType<typeof vi.fn<(status: RenderPipelineStatus) => void>>, onError: ReturnType<typeof vi.fn<(error: string) => void>>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  harness.composers = []; harness.renderPasses = []; harness.aoPasses = []; harness.outputPasses = [];
  harness.throwAllocation = false; harness.throwAO = false; harness.frame = undefined; harness.opaqueCapture = [];
  dpr = 2; target = null; clearColor = new THREE.Color('#456789'); clearAlpha = .8;
  scene = new THREE.Scene(); onStatus = vi.fn(); onError = vi.fn();
  renderer = {
    domElement: document.createElement('canvas'), autoClear: true, toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1.2,
    capabilities: { maxSamples: 4 },
    extensions: { has: vi.fn((name: string) => name === 'EXT_color_buffer_float') },
    getContext: vi.fn(() => ({ RENDERBUFFER: 0x8d41, RGBA16F: 0x881a, SAMPLES: 0x80a9,
      getInternalformatParameter: vi.fn(() => new Int32Array([4, 2, 1])) })),
    getPixelRatio: vi.fn(() => dpr), getRenderTarget: vi.fn(() => target),
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => { target = value; }),
    getClearColor: vi.fn((value: THREE.Color) => value.copy(clearColor)), getClearAlpha: vi.fn(() => clearAlpha),
    setClearColor: vi.fn((value: THREE.ColorRepresentation, alpha?: number) => { clearColor.set(value); if (alpha !== undefined) clearAlpha = alpha; }),
    info: { autoReset: true, render: { calls: 0 }, reset: vi.fn(() => { renderer.info.render.calls = 0; }) },
    render: vi.fn(() => { renderer.info.render.calls++; }),
  } as unknown as THREE.WebGLRenderer;
  harness.runtime = { gl: renderer, scene, camera: new THREE.PerspectiveCamera(), size: { width: 800, height: 500 },
    viewport: { dpr }, invalidate: vi.fn() };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function render(props: ThreeRenderPipelineProps = {}) {
  act(() => root.render(<ThreeRenderPipeline onStatus={onStatus} onError={onError} {...props} />));
}
function frame() { act(() => harness.frame!(harness.runtime, .016)); }

describe('single-owner Three render pipeline', () => {
  it('runs render, GTAO and one output pass in order with full beauty and half-size standard AO', () => {
    render();
    expect(harness.priority).toBe(1);
    expect(harness.composers[0].passes).toEqual([harness.renderPasses[0], harness.aoPasses[0], harness.outputPasses[0]]);
    expect(harness.composers[0].setSize).toHaveBeenCalledWith(800, 500);
    expect(harness.aoPasses[0].setSize).toHaveBeenLastCalledWith(800, 500);
    expect(harness.aoPasses[0].updateGtaoMaterial).toHaveBeenCalledWith(expect.objectContaining({ samples: 8 }));
    frame();
    expect(harness.composers[0].render).toHaveBeenCalledTimes(1);
    expect(harness.outputPasses[0].render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(2); // Beauty and AO G-buffer, no extra R3F output.
    expect(renderer.info.render.calls).toBe(2); expect(renderer.info.autoReset).toBe(true);
    expect(onStatus).toHaveBeenLastCalledWith({ path: 'gtao', width: 1600, height: 1000, aoWidth: 800, aoHeight: 500, samples: 8, msaaSamples: 2 });
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace); expect(renderer.toneMappingExposure).toBe(1.2);
    frame(); expect(onStatus).toHaveBeenCalledTimes(1); // No setState/invalidate loop at rest.
  });

  it('uses one direct render with no composer allocation for performance and AO off', () => {
    render({ quality: 'performance' }); frame();
    expect(harness.composers).toHaveLength(0); expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith({ path: 'direct', width: 1600, height: 1000, aoWidth: 0, aoHeight: 0, samples: 0, msaaSamples: 0 });
    render({ quality: 'high', ambientOcclusion: false }); frame();
    expect(harness.composers).toHaveLength(0); expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.extensions.has).not.toHaveBeenCalled();
  });

  it('falls back before allocating HalfFloat targets when the float color-buffer extension is unsupported', () => {
    vi.mocked(renderer.extensions.has).mockReturnValue(false); render(); frame();
    expect(renderer.extensions.has).toHaveBeenCalledWith('EXT_color_buffer_float');
    expect(harness.composers).toHaveLength(0); expect(harness.aoPasses).toHaveLength(0);
    expect(renderer.render).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.lastCall?.[0]).toMatchObject({ path: 'fallback', aoWidth: 0, aoHeight: 0, samples: 0, msaaSamples: 0 });
    frame(); expect(renderer.render).toHaveBeenCalledTimes(2); expect(onError).toHaveBeenCalledTimes(1);
  });

  it('syncs size and DPR without replacing resources, and applies full-size high AO', () => {
    render({ quality: 'high' }); const composer = harness.composers[0], ao = harness.aoPasses[0];
    expect(ao.setSize).toHaveBeenLastCalledWith(1600, 1000);
    expect(ao.updateGtaoMaterial).toHaveBeenCalledWith(expect.objectContaining({ samples: 16 }));
    harness.runtime.size = { width: 1000, height: 600 }; dpr = 1.25; harness.runtime.viewport = { dpr };
    render({ quality: 'high' }); frame();
    expect(harness.composers).toHaveLength(1); expect(composer.setSize).toHaveBeenLastCalledWith(1000, 600);
    expect(composer.setPixelRatio).toHaveBeenLastCalledWith(1.25); expect(ao.setSize).toHaveBeenLastCalledWith(1250, 750);
    expect(onStatus).toHaveBeenLastCalledWith({ path: 'gtao', width: 1250, height: 750, aoWidth: 1250, aoHeight: 750, samples: 16, msaaSamples: 4 });
    const sizes = ao.setSize.mock.calls.length; frame(); expect(ao.setSize.mock.calls).toHaveLength(sizes);
  });

  it('preserves cached scene geometry/textures through repeated mode switches and releases all owned passes', () => {
    const texture = new THREE.Texture(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ map: texture });
    const textureDispose = vi.spyOn(texture, 'dispose'), geometryDispose = vi.spyOn(geometry, 'dispose'), materialDispose = vi.spyOn(material, 'dispose');
    const cargo = new THREE.Mesh(geometry, material); scene.add(cargo);
    for (const quality of ['high', 'standard', 'performance', 'high'] as const) render({ quality });
    act(() => root.render(null));
    for (const composer of harness.composers) expect(composer.dispose).toHaveBeenCalledTimes(1);
    for (const pass of [...harness.renderPasses, ...harness.aoPasses, ...harness.outputPasses]) expect(pass.dispose).toHaveBeenCalledTimes(1);
    for (const pass of harness.aoPasses) {
      expect(pass.gtaoMaterial.dispose).toHaveBeenCalledTimes(1); expect(pass.blendMaterial.dispose).toHaveBeenCalledTimes(1);
    }
    expect(scene.children).toEqual([cargo]); expect(textureDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    textureDispose.mockRestore(); geometryDispose.mockRestore(); materialDispose.mockRestore();
    texture.dispose(); geometry.dispose(); material.dispose();
  });

  it.each([0, 1, 2, 8])('caps composer MSAA at device support (%i samples) without adding a pass', maxSamples => {
    Object.assign(renderer.capabilities, { maxSamples }); render({ quality: 'high' }); frame();
    const actual = Math.min(4, maxSamples), composer = harness.composers[0];
    expect(composer.renderTarget1.samples).toBe(actual); expect(composer.renderTarget2.samples).toBe(actual);
    expect(composer.passes).toHaveLength(3); expect(onStatus.mock.lastCall?.[0].msaaSamples).toBe(actual);
  });

  it.each([
    { supported: [], requested: 'high' as const, expected: 0 },
    { supported: [4], requested: 'standard' as const, expected: 0 },
    { supported: [2], requested: 'high' as const, expected: 2 },
    { supported: [4, 2], requested: 'high' as const, expected: 4 },
  ])('uses only supported RGBA16F MSAA counts ($requested: $supported)', ({ supported, requested, expected }) => {
    const context = renderer.getContext();
    vi.mocked(renderer.getContext).mockReturnValue({ ...context, getInternalformatParameter: () => new Int32Array(supported) } as unknown as WebGL2RenderingContext);
    render({ quality: requested }); frame();
    expect(harness.composers[0].renderTarget1.samples).toBe(expected);
    expect(harness.composers[0].renderTarget2.samples).toBe(expected);
    expect(onStatus.mock.lastCall?.[0]).toMatchObject({ path: 'gtao', msaaSamples: expected });
  });

  it('balances allocations under StrictMode and does not allocate in render', () => {
    act(() => root.render(<StrictMode><ThreeRenderPipeline /></StrictMode>));
    expect(harness.composers).toHaveLength(2);
    act(() => root.render(null));
    for (const composer of harness.composers) expect(composer.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases context-owned targets on loss, skips lost frames and rebuilds on restoration', () => {
    render(); const first = harness.composers[0];
    const loss = new Event('webglcontextlost', { cancelable: true });
    act(() => renderer.domElement.dispatchEvent(loss)); frame();
    expect(loss.defaultPrevented).toBe(true); expect(first.dispose).toHaveBeenCalledTimes(1); expect(renderer.render).not.toHaveBeenCalled();
    act(() => renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))); frame();
    expect(harness.composers).toHaveLength(2); expect(harness.composers[1].render).toHaveBeenCalledTimes(1);
    act(() => root.render(null)); expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct output after allocation failure and cleans partially created passes', () => {
    harness.throwAllocation = true; render(); frame();
    expect(onError).toHaveBeenCalledWith('Output allocation failed'); expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.lastCall?.[0].path).toBe('fallback');
    expect(harness.composers[0].dispose).toHaveBeenCalledTimes(1); expect(harness.aoPasses[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('restores visibility, override and renderer state after a pass throws, then keeps direct rendering', () => {
    const opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const film = new THREE.Mesh(opaque.geometry, new THREE.MeshStandardMaterial({ transparent: true, opacity: .18, depthWrite: false }));
    scene.add(opaque, film); const originalOverride = new THREE.MeshBasicMaterial(); scene.overrideMaterial = originalOverride;
    const originalColor = clearColor.clone(); target = new THREE.WebGLRenderTarget(1, 1); const originalTarget = target;
    harness.throwAO = true; render(); frame();
    expect(harness.opaqueCapture).toEqual([true, false]); expect(film.visible).toBe(true); expect(scene.overrideMaterial).toBe(originalOverride);
    expect(renderer.autoClear).toBe(true); expect(clearColor).toEqual(originalColor); expect(clearAlpha).toBe(.8); expect(target).toBe(originalTarget);
    expect(onError).toHaveBeenCalledWith('AO render failed'); expect(onStatus.mock.lastCall?.[0].path).toBe('fallback');
    expect(renderer.info.render.calls).toBe(1); expect(renderer.info.autoReset).toBe(true);
    const calls = vi.mocked(renderer.render).mock.calls.length; frame(); expect(renderer.render).toHaveBeenCalledTimes(calls + 1);
    expect(onError).toHaveBeenCalledTimes(1); expect(harness.composers[0].dispose).toHaveBeenCalledTimes(1);
    opaque.geometry.dispose(); (opaque.material as THREE.Material).dispose(); (film.material as THREE.Material).dispose(); originalOverride.dispose(); originalTarget.dispose();
  });
});

describe('opaque-only AO G-buffer', () => {
  it('excludes aisle, selection and clearance lines, points and display-only ghosts while retaining opaque cargo and ground', () => {
    const geometry = new THREE.BoxGeometry(), solid = new THREE.MeshStandardMaterial();
    const cargo = new THREE.Mesh(geometry, solid), ground = new THREE.Mesh(geometry, solid);
    const lineMaterial = new THREE.LineBasicMaterial(), pointMaterial = new THREE.PointsMaterial();
    const aisle = new THREE.LineSegments(geometry, lineMaterial), outline = new THREE.LineSegments(geometry, lineMaterial);
    const clearance = new THREE.Line(geometry, lineMaterial), points = new THREE.Points(geometry, pointMaterial);
    const hiddenLine = new THREE.Line(geometry, lineMaterial); hiddenLine.visible = false;
    const ghost = new THREE.Group(); ghost.userData.displayOnly = true; ghost.add(new THREE.Mesh(geometry, solid));
    scene.add(cargo, ground, aisle, outline, clearance, points, hiddenLine, ghost);
    const ao = () => {
      expect(scene.children.map(object => object.visible)).toEqual([true, true, false, false, false, false, false, false]);
      expect(ghost.children[0].visible).toBe(true); // Its excluded parent hides the complete preview.
    };
    withOpaqueAOGBuffer(scene, ao);
    expect(scene.children.map(object => object.visible)).toEqual([true, true, true, true, true, true, false, true]);
    expect(() => withOpaqueAOGBuffer(scene, () => { ao(); throw new Error('AO failed'); })).toThrow('AO failed');
    expect(scene.children.map(object => object.visible)).toEqual([true, true, true, true, true, true, false, true]);
    geometry.dispose(); solid.dispose(); lineMaterial.dispose(); pointMaterial.dispose();
  });

  it('omits alpha film, cutouts, labels and interior-clipped shells only during AO, preserving hidden objects', () => {
    const geometry = new THREE.BoxGeometry();
    const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ transparent: true, opacity: .3 }),
      new THREE.MeshStandardMaterial({ alphaTest: .5 }), new THREE.ShaderMaterial({ uniforms: { clipInterior: { value: 1 } } })];
    const objects = materials.map(material => new THREE.Mesh(geometry, material));
    const label = new THREE.Sprite(); const hidden = new THREE.Mesh(geometry, materials[0]); hidden.visible = false;
    const flagged = new THREE.Group(); flagged.userData.aoExclude = true;
    const materialFlagged = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); materialFlagged.material.userData.aoExclude = true;
    scene.add(...objects, label, hidden, flagged, materialFlagged);
    withOpaqueAOGBuffer(scene, () => expect(scene.children.map(object => object.visible)).toEqual([true, false, false, false, false, false, false, false]));
    expect(scene.children.map(object => object.visible)).toEqual([true, true, true, true, true, false, true, true]);
    expect(() => withOpaqueAOGBuffer(scene, () => { throw new Error('gbuffer error'); })).toThrow('gbuffer error');
    expect(scene.children.map(object => object.visible)).toEqual([true, true, true, true, true, false, true, true]);
    geometry.dispose(); materials.forEach(material => material.dispose()); label.material.dispose(); materialFlagged.material.dispose();
  });
});
