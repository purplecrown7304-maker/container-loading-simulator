import ThreeClearanceGuides from './ThreeClearanceGuides';
import type { CargoClearance, ClearanceAxis } from './cargoClearance';
import { uiText, useUiLanguage } from './uiLanguage';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementRef } from 'react';
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
import { acceptSceneFrame, sceneCameraPose, stagingSceneCameraPose, stagingVehicleSelection, type ThreeComparisonPlan } from './threeComparisonSceneState';
import ThreeViewerEnvironment, { type EnvironmentStatus } from './ThreeViewerEnvironment';
import { DEFAULT_VIEWER_ENVIRONMENT, type EnvironmentId } from './viewerEnvironment';
import ThreeStagingYard, { ThreeStagingPreview } from './ThreeStagingYard';
import type { StagingSceneBridge } from './stagingSceneContext';
import type { StagingBounds } from './stagingYardLayout';
import ThreeRenderPipeline, { type RenderPipelineStatus } from './ThreeRenderPipeline';
import { useViewerQuality, VIEWER_QUALITY_PROFILES } from './viewerQuality';
import ThreeSceneLighting from './ThreeSceneLighting';
import { cameraFitAction, createCameraMotion, sampleCameraMotion, type CameraMotion, type CameraMotionPose } from './cameraMotion';
import ThreeStagingFlights from './ThreeStagingFlights';
import { createStagingPointerInteraction, type StagingPointerCallbacks } from './stagingPointerInteraction';

export type ThreeComparisonSceneStats = {
  revision: number;
  clearance?: CargoClearance | null;
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
  cameraMoving?: boolean;
  cameraRequest?: string;
  flightActive?: boolean;
  flightCount?: number;
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
  selectedSupport?: number | null;
  clearanceAxis?: ClearanceAxis;
  clearanceVisible?: boolean;
  frameData?: InertiaAnimationFrame;
  /** Supply the frame's original plan revision when the caller owns that identity. */
  frameRevision?: number;
  onSelect: (index: number | null) => void;
  onSupportSelect?: (index: number) => void;
  onInspect?: (kind: 'cargo' | 'support', index: number) => void;
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
  /** Present only for the main workspace; previews/comparisons keep their plan. */
  staging?: StagingSceneBridge | null;
  viewRequest?: number;
  onPipelineStatus?: (status: RenderPipelineStatus) => void;
};
type Resources = ReturnType<typeof createComparisonSceneResources>;
type FrameState = { acceptedFrameStep: number | null; rejectedFrame: boolean };
type StagingCameraState = Pick<StagingSceneBridge, 'layout' | 'visibleZoneIds' | 'viewRequest' | 'dragging'>;

export function CameraController({ plan, view, autoRotate, staging, viewRequest = 0, instant = false }: { plan: ThreeComparisonPlan; view: string; autoRotate: boolean; staging?: StagingCameraState | null; viewRequest?: number; instant?: boolean }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  const { length, width, height } = plan.container;
  const fitted = useRef<{ physical: string; request: string } | null>(null);
  const motion = useRef<CameraMotion | null>(null), destinationLimit = useRef(150);
  const reducedMotion = useRef(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const damping = useRef(false); damping.current = Boolean(staging) && !instant && !autoRotate;
  const lookTarget = useMemo(() => new THREE.Vector3(), []), lastTarget = useMemo(() => new THREE.Vector3(), []);
  const [maxDistance, setMaxDistance] = useState(150);
  const restoreDamping = useCallback(() => { if (controls.current) controls.current.enableDamping = damping.current && !reducedMotion.current; }, []);
  const applyPose = useCallback((pose: CameraMotionPose) => {
    camera.position.fromArray(pose.position); camera.up.set(0, 1, 0); lookTarget.fromArray(pose.target); lastTarget.copy(lookTarget);
    controls.current?.target.copy(lookTarget); camera.lookAt(lookTarget); controls.current?.update();
  }, [camera, lookTarget, lastTarget]);
  const cancelMotion = useCallback(() => {
    motion.current = null; camera.userData.viewerTransitionActive = false; restoreDamping(); invalidate();
  }, [camera, restoreDamping, invalidate]);
  const finishMotion = useCallback(() => {
    const current = motion.current; if (!current) return;
    applyPose(current.to); motion.current = null; camera.userData.viewerTransitionActive = false;
    setMaxDistance(destinationLimit.current); restoreDamping(); invalidate();
  }, [applyPose, camera, restoreDamping, invalidate]);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reducedMotion.current = preference.matches; if (preference.matches) finishMotion(); restoreDamping(); };
    change(); preference.addEventListener?.('change', change);
    return () => preference.removeEventListener?.('change', change);
  }, [finishMotion, restoreDamping]);
  useEffect(() => () => { motion.current = null; camera.userData.viewerTransitionActive = false; }, [camera]);
  useLayoutEffect(() => { if (staging?.dragging || instant || autoRotate) cancelMotion(); }, [staging?.dragging, instant, autoRotate, cancelMotion]);
  useLayoutEffect(() => {
    const physical = `${length}:${width}:${height}:${plan.vehicle}:${plan.vehicleRig}${staging ? `:${plan.geometry}:${plan.equipmentId ?? ''}:${staging.layout.frame.rearCenter.join(',')}:${staging.layout.frame.outward.join(',')}:${staging.layout.frame.groundY}` : ''}`;
    const identity = { physical, request: `${view}:${viewRequest}${staging ? `:staging:${staging.viewRequest}` : ''}` };
    const action = cameraFitAction(fitted.current, identity, { staging: Boolean(staging), reducedMotion: reducedMotion.current, instant: instant || autoRotate || Boolean(staging?.dragging) });
    if (action === 'skip') return;
    fitted.current = identity;
    camera.userData.viewerViewRequest = identity.request;
    const pose = staging && (view === 'all' || view === 'vehicle' || view === 'yard')
      ? stagingSceneCameraPose(plan, view, size.width / Math.max(1, size.height), staging.layout, staging.visibleZoneIds)
      : sceneCameraPose(plan, view, size.width / Math.max(1, size.height));
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 40; camera.near = .02; camera.far = staging ? Math.max(500, pose.distance * 4) : 500; camera.updateProjectionMatrix(); }
    destinationLimit.current = staging ? Math.max(150, pose.distance * 2) : 150;
    const target = controls.current?.target ?? lastTarget;
    const destination = { position: pose.position.toArray(), target: pose.target.toArray() };
    if (action === 'animate') {
      setMaxDistance(Math.max(destinationLimit.current, camera.position.distanceTo(target) * 2));
      motion.current = createCameraMotion({ position: camera.position.toArray(), target: target.toArray() }, destination, performance.now());
      if (controls.current) controls.current.enableDamping = false;
      camera.userData.viewerTransitionActive = true;
    } else {
      motion.current = null; camera.userData.viewerTransitionActive = false; setMaxDistance(destinationLimit.current);
      if (controls.current) controls.current.enableDamping = false;
      applyPose(destination); restoreDamping();
    }
    invalidate();
    // Preserve user orbit/pan when only cargo or frame data changes.
  }, [camera, length, width, height, plan.vehicle, plan.vehicleRig, plan.geometry, plan.equipmentId, view, size.width, size.height, staging, viewRequest, instant, autoRotate, applyPose, restoreDamping, lastTarget, invalidate]);
  useFrame(() => {
    const current = motion.current; if (!current) return;
    const sample = sampleCameraMotion(current, performance.now()); applyPose(sample);
    if (sample.complete) { motion.current = null; camera.userData.viewerTransitionActive = false; setMaxDistance(destinationLimit.current); restoreDamping(); }
    else invalidate();
  }, 0);
  useEffect(() => { invalidate(); }, [autoRotate, invalidate]);
  return <OrbitControls ref={controls} makeDefault enabled={!staging?.dragging} enableDamping={Boolean(staging) && !instant && !autoRotate && !reducedMotion.current} dampingFactor={.1} onStart={cancelMotion} autoRotate={autoRotate && !staging?.dragging} autoRotateSpeed={2} minDistance={.5} maxDistance={maxDistance} minPolarAngle={Math.PI / 180} maxPolarAngle={Math.PI / 2} />;
}

function StagingVehicleOutline({ bounds }: { bounds: StagingBounds | null }) {
  const { invalidate } = useThree();
  const outline = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1), edges = new THREE.EdgesGeometry(box); box.dispose();
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false }));
    line.name = 'Selected vehicle staging root'; line.renderOrder = 8; line.raycast = () => {}; return line;
  }, []);
  useEffect(() => () => { outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); }, [outline]);
  useLayoutEffect(() => {
    outline.visible = Boolean(bounds);
    if (bounds) { outline.position.fromArray(bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5); outline.scale.set(...bounds.max.map((value, axis) => value - bounds.min[axis] + .04) as [number, number, number]); }
    invalidate();
  }, [outline, bounds, invalidate]);
  return <primitive object={outline} dispose={null} />;
}

function SceneContents({ resources, options, bindings, frameState }: { resources: Resources; options: ThreeComparisonSceneProps; bindings: WeakMap<InertiaAnimationFrame, number>; frameState: { current: FrameState } }) {
  const { invalidate } = useThree();
  const { plan, frameData, frameRevision, cut, shell, step, labels, weight, showCg, selected, selectedSupport } = options;
  const flying = Boolean(options.staging?.flight && !frameData && !weight);
  const [clearance, setClearance] = useState<CargoClearance | null>(null);
  const selectionAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const data = event.object.userData;
    if (data.kind === 'cargo') {
      const index = event.instanceId === undefined ? undefined : data.batch?.visibleIndices[event.instanceId];
      if (Number.isInteger(index) && plan.placements[index]) return { kind: 'cargo' as const, index: index as number };
    } else if (data.kind === 'support' && Number.isInteger(data.index) && plan.supports[data.index]) {
      return { kind: 'support' as const, index: data.index as number };
    }
    return null;
  };
  const pointerCallbacks = useRef<StagingPointerCallbacks>(null!);
  pointerCallbacks.current = {
    resolve: event => {
      if (weight || frameData || flying) return null;
      const selection = selectionAt(event);
      if (!selection) return null;
      const support = selection.kind === 'support' ? plan.supports[selection.index] : undefined;
      const unit = options.staging?.inventory.vehicleUnits.find(candidate => selection.kind === 'support'
        ? support && candidate.pallet && (['x', 'y', 'z', 'length', 'width', 'height'] as const)
          .every(key => Math.abs(candidate.pallet![key] - support[key]) < 1e-6)
        : candidate.sourcePlacementIndex === selection.index || candidate.sourcePlacementIndexes?.includes(selection.index));
      if (options.staging && !unit) return null;
      const source = unit?.pallet ?? unit?.placement
        ?? (selection.kind === 'support' ? plan.supports[selection.index] : plan.placements[selection.index]);
      return { ...selection, id: unit?.id ?? `${selection.kind}:${selection.index}`, planeY: source.z,
        center: [source.x + source.length / 2 - plan.container.length / 2, source.z,
          source.y + source.width / 2 - plan.container.width / 2] };
    },
    canDrag: () => Boolean(options.staging && options.staging.canManipulate !== false && !weight && !frameData && !flying),
    onSelect: id => options.staging?.selectUnit(id),
    onInspect: unit => { if (unit.kind !== undefined && unit.index !== undefined) options.onInspect?.(unit.kind, unit.index); },
    onDragStart: options.staging?.onDragStart, onDragMove: options.staging?.onDragMove,
    onDragEnd: options.staging?.onDragEnd, onDraggingChange: options.staging?.onDraggingChange,
  };
  const pointer = useMemo(() => createStagingPointerInteraction(() => pointerCallbacks.current), [resources]);
  useLayoutEffect(() => { pointer.activate(); return () => pointer.dispose(); }, [pointer]);
  useLayoutEffect(() => { if (weight || frameData || flying || options.staging?.canManipulate === false) pointer.cancel(); },
    [pointer, weight, frameData, flying, options.staging?.canManipulate]);
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
    resources.updateVisibility({ cut, shell, step, labels, weight, showCg: showCg && !flying,
      selected: flying ? null : selected, selectedSupport: flying ? null : selectedSupport });
    const selection = selectedSupport != null ? { kind: 'support' as const, index: selectedSupport }
      : selected != null && resources.isCargoVisible(selected) ? { kind: 'cargo' as const, index: selected } : null;
    setClearance(weight || flying ? null : resources.clearanceForSelection(selection)); invalidate();
  }, [resources, plan, frameData, frameRevision, cut, shell, step, labels, weight, showCg, selected, selectedSupport, bindings, frameState, invalidate, flying]);
  const selectCell = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!weight || event.object.userData.kind !== 'weightSurface') return;
    event.stopPropagation();
    const point = event.object.worldToLocal(event.point.clone());
    options.onCellSelect?.(weightSurfaceCellIndex(plan.cells, plan.container, point.x, point.z));
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4 || event.button !== 0) return;
    const data = event.object.userData;
    if (data.kind === 'cargo') {
      const index = event.instanceId === undefined ? undefined : data.batch.visibleIndices[event.instanceId];
      if (index === undefined) return;
      event.stopPropagation(); options.onSelect(index);
    } else if (data.kind === 'support') { event.stopPropagation(); options.onSupportSelect?.(data.index); }
    else if (data.kind === 'weightSurface' && weight) selectCell(event);
  };
  return <>{options.staging && <ThreeStagingFlights resources={resources} plan={plan} units={options.staging.inventory.vehicleUnits}
    sequence={options.staging.flight ?? null} suspended={Boolean(frameData || weight)} onComplete={options.staging.completeFlight ?? (() => {})} />}
    <ThreeClearanceGuides plan={plan} clearance={options.clearanceVisible === false || flying ? null : clearance} axis={options.clearanceAxis ?? 'width'}/><primitive object={resources.root} dispose={null} {...pointer.handlers} onClick={handleClick} onPointerMove={(event: ThreeEvent<PointerEvent>) => { pointer.handlers.onPointerMove(event); selectCell(event); }}
    onPointerOut={(event: ThreeEvent<PointerEvent>) => { if (event.object.userData.kind === 'weightSurface') options.onCellSelect?.(null); }} /></>;
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
  // Read after the sole output pipeline renders pose/visibility updates, so
  // inspector, diagnostics and readiness describe the completed demand frame.
  useFrame(state => {
    if (!resources) return;
    const stats: ThreeComparisonSceneStats = {
      clearance: !options.weight && !resources.displayFlightActive ? resources.clearanceForSelection(options.selectedSupport != null ? { kind: 'support', index: options.selectedSupport }
        : options.selected != null && resources.isCargoVisible(options.selected) ? { kind: 'cargo', index: options.selected } : null) : null,
      revision: options.plan.revision, modelCount: resources.modelCount, labelFaces: resources.labelFaces,
      visibleLabelFaces: resources.visibleLabelFaces, visibleCargo: resources.visibleCargo,
      renderCalls: state.gl.info.render.calls, triangles: state.gl.info.render.triangles,
      geometries: state.gl.info.memory.geometries, textures: state.gl.info.memory.textures,
      cgVisible: resources.centerOfGravityVisible, cgPosition: resources.centerOfGravityPosition,
      cameraPose: [...state.camera.position.toArray(), ...state.camera.quaternion.toArray()].map(value => value.toFixed(5)).join(','),
      cameraMoving: state.camera.userData.viewerTransitionActive === true,
      cameraRequest: typeof state.camera.userData.viewerViewRequest === 'string' ? state.camera.userData.viewerViewRequest : undefined,
      flightActive: resources.displayFlightActive, flightCount: resources.displayFlightCount,
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
  }, 2);
  return <CameraController plan={options.plan} view={options.view} autoRotate={autoRotate} staging={options.staging} viewRequest={options.viewRequest} instant={Boolean(options.frameData || options.benchmark)} />;
}

function WebGLFallback({ onError }: { onError?: (message: string) => void }) {
  useEffect(() => { onError?.('Three.js comparison requires a WebGL-capable browser'); }, [onError]);
  return <p role="alert">Three.js comparison requires a WebGL-capable browser</p>;
}

/** Opt-in rendering comparison. It consumes the unchanged Unity plan and Rapier
 * output; no loading, collision, securing or certification decision occurs here. */
export default function ThreeComparisonScene(options: ThreeComparisonSceneProps) {
  useUiLanguage();
  const quality = useViewerQuality();
  const { plan } = options;
  const callbacks = useRef(options); callbacks.current = options;
  const bindings = useRef(new WeakMap<InertiaAnimationFrame, number>());
  const frameState = useRef<FrameState>({ acceptedFrameStep: null, rejectedFrame: false });
  const [loaded, setLoaded] = useState<{ plan: ThreeComparisonPlan; resources: Resources } | null>(null);
  const [error, setError] = useState('');
  const [yardError, setYardError] = useState(''), [yardAttempt, setYardAttempt] = useState(0);
  const [pipelineError, setPipelineError] = useState('');
  useEffect(() => { setPipelineError(''); }, [quality]);
  useEffect(() => { setYardError(''); }, [options.staging?.inventory.inputSignature]);
  useEffect(() => {
    if (error && options.staging?.flight) options.staging.completeFlight?.(options.staging.flight.id);
  }, [error, options.staging]);
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
  const staging = options.staging;
  const selectedStaging = staging ? stagingVehicleSelection(plan, staging.inventory.vehicleUnits, staging.selectedUnitId) : null;
  const previewUnit = staging?.preview ? staging.inventory.units.find(unit => unit.id === staging.preview!.unitId) : null;
  return <div style={{ width: '100%', height: '100%', position: 'relative', minHeight: 180 }} data-three-scene-ready={Boolean(resources)}>
    <Canvas frameloop="demand" camera={{ fov: 40, near: .02, far: 500, position: [10, 7, 10] }} dpr={VIEWER_QUALITY_PROFILES[quality.quality].dpr} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onPointerMissed={event => { if (event.type === 'click' && event.button === 0) options.onSelect(null); }} onContextMenu={event => event.preventDefault()} fallback={<WebGLFallback onError={options.onError} />}>
      <ThreeSceneLighting quality={quality.quality} groundY={groundY} />
      <ThreeViewerEnvironment groundY={groundY} id={options.environment ?? DEFAULT_VIEWER_ENVIRONMENT} length={plan.container.length} width={plan.container.width} height={plan.container.height} attempt={options.environmentAttempt} onStatus={options.onEnvironmentStatus} />
      {resources && <SceneContents resources={resources} options={options} bindings={bindings.current} frameState={frameState} />}
      {staging && <ThreeStagingYard key={yardAttempt} units={staging.inventory.yardUnits} layout={staging.layout} visibleZoneIds={staging.visibleZoneIds} selectedUnitId={staging.selectedUnitId} cartonLabelsEnabled={options.labels}
        labels={{ empty: uiText('대기 화물 없음'), aisle: uiText('이동 통로'), doorClearance: uiText('출입문 여유 공간'), boxes: uiText('낱박스'), pallets: uiText('파렛트'), pending: uiText('계산 전'), checking: uiText('검토 중'), unloaded: uiText('미적재'), error: uiText('입력·포장 확인') }}
        canDrag={staging.canManipulate !== false && !options.frameData && !options.weight && !staging.flight}
        onInspect={staging.inspectUnit} onSelect={staging.selectUnit} onDragStart={staging.onDragStart} onDragMove={staging.onDragMove} onDragEnd={staging.onDragEnd} onDraggingChange={staging.onDraggingChange} onError={setYardError} />}
      {staging && <StagingVehicleOutline bounds={staging.flight?.flights.some(flight => flight.unitId === staging.selectedUnitId) ? null : selectedStaging?.bounds ?? null} />}
      {staging?.preview && previewUnit && <ThreeStagingPreview unit={previewUnit} candidate={staging.preview.candidate} container={plan.container} valid={staging.preview.valid} onError={setYardError} />}
      <SceneRuntime resources={resources} options={options} frameState={frameState} />
      <ThreeRenderPipeline quality={quality.quality} ambientOcclusion={quality.ambientOcclusion} onStatus={options.onPipelineStatus} onError={setPipelineError} />
    </Canvas>
    {pipelineError && <div className="three-environment-error" role="status">{uiText('접촉 음영을 사용할 수 없어 기본 렌더링으로 표시합니다.')}</div>}
    {yardError && <div className="three-environment-error" role="status">{uiText('대기장 표시 실패')} · {yardError} <button type="button" data-view-only="true" onClick={() => { setYardError(''); setYardAttempt(value => value + 1); }}>{uiText('대기장 다시 시도')}</button></div>}
    {error && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 24, background: '#fff8f4', color: '#9f1239' }}><b>{uiText("Meshy 모델을 불러오지 못했습니다")}</b><span>{error}</span></div>}
  </div>;
}
