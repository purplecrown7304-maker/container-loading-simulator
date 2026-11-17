import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VIEWER_QUALITY_PROFILES, type ViewerQuality } from './viewerQuality';

export type ThreeRenderQuality = ViewerQuality;
export type RenderPipelineStatus = {
  path: 'gtao' | 'direct' | 'fallback';
  /** Physical render-target pixels, including the current renderer DPR. */
  width: number; height: number; aoWidth: number; aoHeight: number; samples: number; msaaSamples: number;
};
export type ThreeRenderPipelineProps = {
  quality?: ThreeRenderQuality;
  ambientOcclusion?: boolean;
  onError?: (message: string) => void;
  onStatus?: (status: RenderPipelineStatus) => void;
};

function excludesMaterial(material: Material) {
  const shader = material as Material & { uniforms?: Record<string, { value: unknown }> };
  return material.userData.aoExclude === true || material.transparent || material.opacity < 1 || !material.depthWrite
    || material.alphaTest > 0 || shader.uniforms?.clipInterior?.value === 1;
}

/** The beauty pass retains film, labels and clipped shells. MeshNormalMaterial
 * cannot reproduce their alpha/interior discard, so only the AO G-buffer omits them. */
export function withOpaqueAOGBuffer<T>(scene: Scene, render: () => T): T {
  const visibility: Array<[Object3D, boolean]> = [];
  const override = scene.overrideMaterial;
  scene.traverse(object => {
    visibility.push([object, object.visible]);
    const renderable = object as Object3D & { material?: Material | Material[]; isSprite?: boolean; isLine?: boolean; isLine2?: boolean; isPoints?: boolean };
    const materials = renderable.material ? Array.isArray(renderable.material) ? renderable.material : [renderable.material] : [];
    if (object.userData.aoExclude === true || object.userData.displayOnly === true || renderable.isSprite
      || renderable.isLine || renderable.isLine2 || renderable.isPoints || materials.some(excludesMaterial)) object.visible = false;
  });
  try { return render(); }
  finally {
    for (const [object, visible] of visibility) object.visible = visible;
    scene.overrideMaterial = override;
  }
}

class OpaqueGTAOPass extends GTAOPass {
  override render(...args: Parameters<GTAOPass['render']>) {
    return withOpaqueAOGBuffer(this.scene, () => super.render(...args));
  }
}

function supportedFloatMSAA(renderer: WebGLRenderer, requested: number): number {
  const maximum = renderer.capabilities.maxSamples;
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  // EXT_color_buffer_float does not require multisampled float attachments.
  // MAX_SAMPLES alone cannot establish RGBA16F renderbuffer support.
  try {
    const gl = renderer.getContext();
    if (!('getInternalformatParameter' in gl) || typeof gl.getInternalformatParameter !== 'function') return 0;
    const supported: unknown = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
    if (!Array.isArray(supported) && !ArrayBuffer.isView(supported)) return 0;
    const counts = Array.from(supported as ArrayLike<number>);
    return Math.max(0, ...counts.filter(value => Number.isSafeInteger(value) && value > 0 && value <= requested && value <= maximum));
  } catch { return 0; }
}

/** Owns only composer/pass render targets, noise and fullscreen materials.
 * Scene models, environment maps and source textures remain cache-owned. */
export function createThreeRenderPipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera,
  quality: Exclude<ThreeRenderQuality, 'performance'>) {
  // Shader/framebuffer GL errors need not throw JavaScript exceptions. Reject
  // unsupported HalfFloat targets before allocating either addon so direct
  // rendering remains available even when GTAO cannot be initialized.
  if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('GTAO requires EXT_color_buffer_float. Using standard rendering.');
  const settings = VIEWER_QUALITY_PROFILES[quality];
  const msaaSamples = supportedFloatMSAA(renderer, settings.msaaSamples);
  const composer = new EffectComposer(renderer);
  // Canvas antialias affects only its default framebuffer. Beauty buffers need
  // their own multisample storage; resolving them does not add a postprocess pass.
  composer.renderTarget1.samples = msaaSamples; composer.renderTarget2.samples = msaaSamples;
  let renderPass: RenderPass | undefined, aoPass: OpaqueGTAOPass | undefined, outputPass: OutputPass | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    renderPass?.dispose();
    if (aoPass) {
      aoPass.dispose();
      // r185 GTAOPass.dispose omits these two pass-owned shader materials.
      aoPass.gtaoMaterial.dispose(); aoPass.blendMaterial.dispose();
    }
    outputPass?.dispose(); composer.dispose();
  };
  try {
    renderPass = new RenderPass(scene, camera);
    aoPass = new OpaqueGTAOPass(scene, camera, 1, 1);
    aoPass.output = GTAOPass.OUTPUT.Default;
    aoPass.blendIntensity = .65;
    aoPass.updateGtaoMaterial({ radius: .25, thickness: .1, samples: settings.aoSamples, distanceFallOff: 1 });
    aoPass.updatePdMaterial({ samples: settings.aoSamples, radius: 4 });
    outputPass = new OutputPass();
    composer.addPass(renderPass); composer.addPass(aoPass); composer.addPass(outputPass);
  } catch (error) { dispose(); throw error; }
  let width = -1, height = -1, pixelRatio = renderer.getPixelRatio();
  return {
    msaaSamples,
    resize(nextWidth: number, nextHeight: number, nextDpr: number) {
      const w = Math.max(1, Math.floor(nextWidth)), h = Math.max(1, Math.floor(nextHeight));
      const dpr = Number.isFinite(nextDpr) && nextDpr > 0 ? nextDpr : 1;
      if (disposed || (w === width && h === height && dpr === pixelRatio)) return;
      if (dpr !== pixelRatio) composer.setPixelRatio(dpr);
      if (w !== width || h !== height) composer.setSize(w, h);
      aoPass!.setSize(Math.max(1, Math.floor(w * dpr * settings.aoScale)), Math.max(1, Math.floor(h * dpr * settings.aoScale)));
      width = w; height = h; pixelRatio = dpr;
    },
    render(delta: number) {
      if (disposed) return;
      const target = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      const clearColor = renderer.getClearColor(new Color()).clone(), clearAlpha = renderer.getClearAlpha();
      const override = scene.overrideMaterial;
      // Rendering into linear composer targets suppresses native screen output
      // transforms. OutputPass then uses the renderer's unchanged tone/color settings once.
      try { composer.render(delta); }
      finally {
        renderer.setRenderTarget(target); renderer.autoClear = autoClear;
        renderer.setClearColor(clearColor, clearAlpha); scene.overrideMaterial = override;
      }
    },
    dispose,
  };
}

/** Positive priority takes exclusive output ownership from R3F. Statistics may
 * subscribe at priority 2, after either composed or direct rendering completes. */
export default function ThreeRenderPipeline({ quality = 'standard', ambientOcclusion = true, onError, onStatus }: ThreeRenderPipelineProps) {
  const { gl, scene, camera, size, viewport, invalidate } = useThree();
  const callbacks = useRef({ onError, onStatus }); callbacks.current = { onError, onStatus };
  const pipeline = useRef<ReturnType<typeof createThreeRenderPipeline> | null>(null);
  const failed = useRef(false), lastStatus = useRef('');
  const contextLost = useRef(false);
  const [contextRevision, setContextRevision] = useState(0);
  useLayoutEffect(() => {
    contextLost.current = false;
    const lost = (event: Event) => { event.preventDefault(); contextLost.current = true; pipeline.current?.dispose(); pipeline.current = null; };
    const restored = () => { contextLost.current = false; setContextRevision(value => value + 1); };
    gl.domElement.addEventListener('webglcontextlost', lost); gl.domElement.addEventListener('webglcontextrestored', restored);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost); gl.domElement.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl]);
  useLayoutEffect(() => {
    failed.current = false;
    if (!ambientOcclusion || quality === 'performance' || contextLost.current) return;
    try { pipeline.current = createThreeRenderPipeline(gl, scene, camera, quality); }
    catch (error) { failed.current = true; callbacks.current.onError?.(error instanceof Error ? error.message : String(error)); }
    const owned = pipeline.current;
    return () => { owned?.dispose(); if (pipeline.current === owned) pipeline.current = null; };
  }, [gl, scene, camera, quality, ambientOcclusion, contextRevision]);
  useLayoutEffect(() => {
    pipeline.current?.resize(size.width, size.height, gl.getPixelRatio()); invalidate();
  }, [gl, size.width, size.height, viewport.dpr, quality, ambientOcclusion, contextRevision, invalidate]);
  useFrame((state, delta) => {
    if (contextLost.current) return;
    const autoReset = state.gl.info.autoReset;
    state.gl.info.autoReset = false; state.gl.info.reset();
    try {
      const active = pipeline.current;
      if (active) {
        try { active.resize(state.size.width, state.size.height, state.gl.getPixelRatio()); active.render(delta); }
        catch (error) {
          active.dispose(); if (pipeline.current === active) pipeline.current = null;
          failed.current = true; state.gl.info.reset();
          callbacks.current.onError?.(error instanceof Error ? error.message : String(error));
          state.gl.render(state.scene, state.camera);
        }
      } else state.gl.render(state.scene, state.camera);
    } finally { state.gl.info.autoReset = autoReset; }
    const profile = VIEWER_QUALITY_PROFILES[quality], dpr = state.gl.getPixelRatio();
    const width = Math.max(1, Math.floor(state.size.width)) * dpr, height = Math.max(1, Math.floor(state.size.height)) * dpr;
    const composed = Boolean(pipeline.current);
    const status: RenderPipelineStatus = { path: composed ? 'gtao' : failed.current ? 'fallback' : 'direct',
      width: Math.floor(width), height: Math.floor(height),
      aoWidth: composed ? Math.max(1, Math.floor(width * profile.aoScale)) : 0,
      aoHeight: composed ? Math.max(1, Math.floor(height * profile.aoScale)) : 0, samples: composed ? profile.aoSamples : 0,
      msaaSamples: pipeline.current?.msaaSamples ?? 0 };
    const signature = JSON.stringify(status);
    if (signature !== lastStatus.current) { lastStatus.current = signature; callbacks.current.onStatus?.(status); }
  }, 1);
  return null;
}
