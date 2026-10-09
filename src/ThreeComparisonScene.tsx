import { useEffect, useLayoutEffect, useRef, useState, type ElementRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { weightSurfaceCellIndex } from './weightSurfaceGeometry';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { vehicleLayout } from './threeVehicleLayout';
import { loadVehicleModel, type VehicleModels } from './threeVehicleModels';
import { loadMeshyModel } from './threeComparisonModels';
import { acquireComparisonLabels } from './threeComparisonLabels';
import { createComparisonSceneResources, requiredComparisonModelKeys, type ComparisonModels } from './threeComparisonSceneResources';
import { acceptSceneFrame, sceneCameraPose, type ThreeComparisonPlan } from './threeComparisonSceneState';
import ThreeViewerEnvironment, { type EnvironmentStatus } from './ThreeViewerEnvironment';
import { DEFAULT_VIEWER_ENVIRONMENT, type EnvironmentId } from './viewerEnvironment';

export type ThreeComparisonSceneStats = {
  revision: number;
  modelCount: number;
  labelFaces: number;
  visibleLabelFaces: number;
  visibleCargo: number;
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  acceptedFrameStep: number | null;
  rejectedFrame: boolean;
  cgVisible: boolean;
  cgPosition: [number, number, number] | null;
  cameraPose: string;
};
export type ThreeComparisonBenchmark = {
  durationMs: number;
  sampleCount: number;
  meanFrameMs: number;
  p95FrameMs: number;
  fps: number;
  renderCalls: number;
  triangles: number;
};
export type VehicleStatus = { status: 'loading' | 'ready' | 'fallback' | 'none'; message?: string };
export type ThreeComparisonSceneProps = {
  plan: ThreeComparisonPlan;
  cut: number;
  shell: boolean;
  step: number;
  labels: boolean;
  weight: boolean;
  showCg: boolean;
  view: string;
  selected: number | null;
  frameData?: InertiaAnimationFrame;
  /** Supply the frame's original plan revision when the caller owns that identity. */
  frameRevision?: number;
  onSelect: (index: number | null) => void;
  onSupportSelect?: (index: number) => void;
  onCellSelect?: (index: number | null) => void;
  onReady?: (stats: ThreeComparisonSceneStats) => void;
  onStats?: (stats: ThreeComparisonSceneStats) => void;
  onError?: (message: string) => void;
  benchmark?: boolean;
  onBenchmark?: (result: ThreeComparisonBenchmark) => void;
  environment?: EnvironmentId;
  environmentAttempt?: number;
  onEnvironmentStatus?: (status: EnvironmentStatus) => void;
  vehicleAttempt?: number;
  onVehicleStatus?: (status: VehicleStatus) => void;
};
type Resources = ReturnType<typeof createComparisonSceneResources>;
type FrameState = { acceptedFrameStep: number | null; rejectedFrame: boolean };

export function CameraController({ plan, view, autoRotate }: { plan: ThreeComparisonPlan; view: string; autoRotate: boolean }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  const { length, width, height } = plan.container;
  const fitted = useRef('');
  useLayoutEffect(() => {
    const identity = `${length}:${width}:${height}:${plan.vehicle}:${plan.vehicleRig}:${view}`;
    if (fitted.current === identity) return;
    fitted.current = identity;
    const pose = sceneCameraPose(plan, view, size.width / Math.max(1, size.height));
    camera.position.copy(pose.position); camera.up.set(0, 1, 0); camera.lookAt(pose.target);
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 40; camera.near = .02; camera.far = 500; camera.updateProjectionMatrix(); }
    controls.current?.target.copy(pose.target); controls.current?.update(); invalidate();
    // Preserve user orbit/pan when only cargo or frame data changes.
  }, [camera, length, width, height, plan.vehicle, plan.vehicleRig, view, size.width, size.height, invalidate]);
  useEffect(() => { invalidate(); }, [autoRotate, invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} autoRotate={autoRotate} autoRotateSpeed={2} minDistance={.5} maxDistance={150} minPolarAngle={Math.PI / 180} maxPolarAngle={Math.PI / 2} />;
}

function SceneContents({ resources, options, bindings, frameState }: { resources: Resources; options: ThreeComparisonSceneProps; bindings: WeakMap<InertiaAnimationFrame, number>; frameState: { current: FrameState } }) {
  const { invalidate } = useThree();
  const { plan, frameData, frameRevision, cut, shell, step, labels, weight, showCg, selected } = options;
  useLayoutEffect(() => {
    if (!frameData) {
      resources.applyFrame(); frameState.current = { acceptedFrameStep: null, rejectedFrame: false };
    } else if (acceptSceneFrame(plan, frameData, bindings, frameRevision)) {
      resources.applyFrame(frameData); frameState.current = { acceptedFrameStep: frameData.step, rejectedFrame: false };
    } else {
      // Retain the previous complete pose for this plan. A new plan starts at its
      // own baseline; a stale/partial frame is never allowed to mix the two.
      frameState.current = { ...frameState.current, rejectedFrame: true };
    }
    resources.updateVisibility({ cut, shell, step, labels, weight, showCg, selected }); invalidate();
  }, [resources, plan, frameData, frameRevision, cut, shell, step, labels, weight, showCg, selected, bindings, frameState, invalidate]);
  const selectCell = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!weight || event.object.userData.kind !== 'weightSurface') return;
    event.stopPropagation();
    const point = event.object.worldToLocal(event.point.clone());
    options.onCellSelect?.(weightSurfaceCellIndex(plan.cells, plan.container, point.x, point.z));
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    const data = event.object.userData;
    if (data.kind === 'cargo') {
      const index = event.instanceId === undefined ? undefined : data.batch.visibleIndices[event.instanceId];
      if (index === undefined) return;
      event.stopPropagation(); options.onSelect(index);
    } else if (data.kind === 'support') { event.stopPropagation(); options.onSupportSelect?.(data.index); }
    else if (data.kind === 'weightSurface' && weight) selectCell(event);
  };
  return <primitive object={resources.root} dispose={null} onClick={handleClick} onPointerMove={selectCell}
    onPointerOut={(event: ThreeEvent<PointerEvent>) => { if (event.object.userData.kind === 'weightSurface') options.onCellSelect?.(null); }} />;
}

function SceneRuntime({ resources, options, frameState }: { resources: Resources | null; options: ThreeComparisonSceneProps; frameState: { current: FrameState } }) {
  const { invalidate, gl } = useThree();
  const callbacks = useRef(options); callbacks.current = options;
  const readyResource = useRef<Resources | null>(null), lastStats = useRef('');
  const [autoRotate, setAutoRotate] = useState(false);
  const run = useRef<{ started: number; previous: number; samples: number[]; calls: number; triangles: number } | null>(null);
  useEffect(() => {
    if (options.benchmark && resources) {
      run.current = { started: 0, previous: 0, samples: [], calls: 0, triangles: 0 }; setAutoRotate(true); invalidate();
    } else { run.current = null; setAutoRotate(false); }
  }, [options.benchmark, resources, invalidate]);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onError?.('WebGL context was lost. Reload the comparison to retry.'); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  // Render explicitly at positive priority so reported counters are from this
  // completed frame, not a stale previous frame. Demand mode remains idle at rest.
  useFrame(state => {
    state.gl.render(state.scene, state.camera);
    if (!resources) return;
    const stats: ThreeComparisonSceneStats = {
      revision: options.plan.revision, modelCount: resources.modelCount, labelFaces: resources.labelFaces,
      visibleLabelFaces: resources.visibleLabelFaces, visibleCargo: resources.visibleCargo,
      renderCalls: state.gl.info.render.calls, triangles: state.gl.info.render.triangles,
      geometries: state.gl.info.memory.geometries, textures: state.gl.info.memory.textures,
      cgVisible: resources.centerOfGravityVisible, cgPosition: resources.centerOfGravityPosition,
      cameraPose: [...state.camera.position.toArray(), ...state.camera.quaternion.toArray()].map(value => value.toFixed(5)).join(','),
      ...frameState.current,
    };
    if (readyResource.current !== resources) { readyResource.current = resources; callbacks.current.onReady?.(stats); }
    const signature = JSON.stringify(stats);
    if (signature !== lastStats.current) { lastStats.current = signature; callbacks.current.onStats?.(stats); }
    const sample = run.current;
    if (sample) {
      const now = performance.now();
      if (!sample.started) { sample.started = now; sample.previous = now; }
      else { sample.samples.push(now - sample.previous); sample.previous = now; }
      sample.calls += stats.renderCalls; sample.triangles += stats.triangles;
      if (now - sample.started >= 5000) {
        const sorted = [...sample.samples].sort((a, b) => a - b), durationMs = now - sample.started, count = sample.samples.length;
        run.current = null; setAutoRotate(false);
        callbacks.current.onBenchmark?.({ durationMs, sampleCount: count, meanFrameMs: count ? durationMs / count : 0, p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0, fps: count * 1000 / durationMs, renderCalls: sample.calls / Math.max(1, count + 1), triangles: sample.triangles / Math.max(1, count + 1) });
      } else invalidate();
    }
  }, 1);
  return <CameraController plan={options.plan} view={options.view} autoRotate={autoRotate} />;
}

function WebGLFallback({ onError }: { onError?: (message: string) => void }) {
  useEffect(() => { onError?.('Three.js comparison requires a WebGL-capable browser'); }, [onError]);
  return <p role="alert">Three.js comparison requires a WebGL-capable browser</p>;
}

/** Opt-in rendering comparison. It consumes the unchanged Unity plan and Rapier
 * output; no loading, collision, securing or certification decision occurs here. */
export default function ThreeComparisonScene(options: ThreeComparisonSceneProps) {
  const { plan } = options;
  const callbacks = useRef(options); callbacks.current = options;
  const bindings = useRef(new WeakMap<InertiaAnimationFrame, number>());
  const frameState = useRef<FrameState>({ acceptedFrameStep: null, rejectedFrame: false });
  const [loaded, setLoaded] = useState<{ plan: ThreeComparisonPlan; resources: Resources } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setError(''); frameState.current = { acceptedFrameStep: null, rejectedFrame: false };
    const labels = acquireComparisonLabels(plan);
    const models = Promise.all(requiredComparisonModelKeys(plan).map(async key => [key, await loadMeshyModel(key)] as const));
    const vehicleKeys = vehicleLayout(plan.vehicleRig ?? 'none', plan.container).placements.map(item => item.key);
    callbacks.current.onVehicleStatus?.({ status: vehicleKeys.length ? 'loading' : 'none' });
    const vehicles = Promise.all(vehicleKeys.map(async key => [key, await loadVehicleModel(key)] as const))
      .then(assets => ({ models: Object.fromEntries(assets) as VehicleModels, error: '' }))
      .catch((reason: unknown) => ({ models: {} as VehicleModels, error: reason instanceof Error ? reason.message : String(reason) }));
    Promise.all([models, labels, vehicles]).then(([assets, acquired, vehicle]) => {
      if (cancelled) { acquired.release(); return; }
      const mapped = Object.fromEntries(assets) as ComparisonModels;
      try {
        const resources = createComparisonSceneResources(vehicle.error ? { ...plan, vehicleRig: 'none' } : plan, mapped, acquired.materials, vehicle.models);
        callbacks.current.onVehicleStatus?.(vehicle.error ? { status: 'fallback', message: vehicle.error } : { status: vehicleKeys.length ? 'ready' : 'none' });
        dispose = () => { resources.dispose(); acquired.release(); };
        setLoaded({ plan, resources });
      } catch (reason) { acquired.release(); throw reason; }
    }).catch(reason => {
      void labels.then(acquired => acquired.release(), () => {});
      if (cancelled) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); callbacks.current.onError?.(message);
    });
    return () => { cancelled = true; dispose?.(); };
  }, [plan, options.vehicleAttempt]);
  const resources = loaded?.plan === plan ? loaded.resources : null;
  const groundY = vehicleLayout(plan.vehicleRig ?? 'none', plan.container).groundY;
  return <div style={{ width: '100%', height: '100%', position: 'relative', minHeight: 180 }} data-three-scene-ready={Boolean(resources)}>
    <Canvas frameloop="demand" camera={{ fov: 40, near: .02, far: 500, position: [10, 7, 10] }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onPointerMissed={event => { if (event.type === 'click') options.onSelect(null); }} onContextMenu={event => event.preventDefault()} fallback={<WebGLFallback onError={options.onError} />}>
      <ambientLight intensity={1.5} /><directionalLight position={[-8, 12, 8]} intensity={2.4} /><directionalLight position={[6, 8, -6]} intensity={1.1} />
      <ThreeViewerEnvironment groundY={groundY} id={options.environment ?? DEFAULT_VIEWER_ENVIRONMENT} length={plan.container.length} width={plan.container.width} height={plan.container.height} attempt={options.environmentAttempt} onStatus={options.onEnvironmentStatus} />
      {resources && <SceneContents resources={resources} options={options} bindings={bindings.current} frameState={frameState} />}
      <SceneRuntime resources={resources} options={options} frameState={frameState} />
    </Canvas>
    {error && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 24, background: '#fff8f4', color: '#9f1239' }}><b>Meshy 모델을 불러오지 못했습니다</b><span>{error}</span></div>}
  </div>;
}
