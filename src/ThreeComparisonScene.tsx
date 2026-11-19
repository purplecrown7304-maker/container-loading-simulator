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
import ThreeViewerSnapshot from './ThreeViewerSnapshot';
import { useViewerQuality, VIEWER_QUALITY_PROFILES } from './viewerQuality';
import ThreeSceneLighting from './ThreeSceneLighting';
import { cameraFitAction, createCameraMotion, sampleCameraMotion, type CameraMotion, type CameraMotionPose } from './cameraMotion';
import ThreeStagingFlights from './ThreeStagingFlights';
import { createStagingPointerInteraction, type StagingPointerCallbacks, type StagingPointerUnit } from './stagingPointerInteraction';
import { nearestStagingHit, nextStagingHover, STAGING_CONFLICT_COLOR, STAGING_HOVER_COLOR, stagingCursor, stagingHitSource, stagingPreviewConflicts, stagingUnitDraggable, stagingUnitSceneBounds, type StagingHover } from './stagingDragCues';
import { ThreeStagingCursor, ThreeStagingOutlines } from './ThreeStagingCues';
import { createSceneRetirement } from './sceneRetirement';
import { arrivalStartMs, arrivingOffset, departingOffset, dockShade, recallVehicleSwap, retargetVehicleSwap, VEHICLE_SWAP_PROFILE, vehicleIdentity, vehicleSwapTravel, type VehicleSwapState } from './vehicleSwapMotion';

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

/** Camera-only statistics reach React at most this often while the view moves.
 * Scene, selection, frame and flight changes are still reported on their frame. */
export const CAMERA_STATS_INTERVAL_MS = 120;

/** Everything a scene is built from. `revision` only names the request. */
export function planContentKey(plan: ThreeComparisonPlan) {
  const { revision: _revision, ...content } = plan;
  return JSON.stringify(content);
}

export function CameraController({ plan, view, autoRotate, staging, viewRequest = 0, instant = false, physicalTransition = false }: { plan: ThreeComparisonPlan; view: string; autoRotate: boolean; staging?: StagingCameraState | null; viewRequest?: number; instant?: boolean; physicalTransition?: boolean }) {
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
    const action = cameraFitAction(fitted.current, identity, { staging: Boolean(staging), reducedMotion: reducedMotion.current, instant: instant || autoRotate || Boolean(staging?.dragging), physicalTransition });
    if (action === 'skip') return;
    // The equipment itself is being replaced on screen; follow it at its own pace.
    const equipmentChanged = fitted.current !== null && fitted.current.physical !== physical;
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
      motion.current = createCameraMotion({ position: camera.position.toArray(), target: target.toArray() }, destination, performance.now(),
        equipmentChanged ? VEHICLE_SWAP_PROFILE.cameraMs : undefined);
      if (controls.current) controls.current.enableDamping = false;
      camera.userData.viewerTransitionActive = true;
    } else {
      motion.current = null; camera.userData.viewerTransitionActive = false; setMaxDistance(destinationLimit.current);
      if (controls.current) controls.current.enableDamping = false;
      applyPose(destination); restoreDamping();
    }
    invalidate();
    // Preserve user orbit/pan when only cargo or frame data changes.
  }, [camera, length, width, height, plan.vehicle, plan.vehicleRig, plan.geometry, plan.equipmentId, view, size.width, size.height, staging, viewRequest, instant, autoRotate, physicalTransition, applyPose, restoreDamping, lastTarget, invalidate]);
  useFrame(() => {
    const current = motion.current; if (!current) return;
    const sample = sampleCameraMotion(current, performance.now()); applyPose(sample);
    if (sample.complete) { motion.current = null; camera.userData.viewerTransitionActive = false; setMaxDistance(destinationLimit.current); restoreDamping(); }
    else invalidate();
  }, 0);
  useEffect(() => { invalidate(); }, [autoRotate, invalidate]);
  return <OrbitControls ref={controls} makeDefault enabled={!staging?.dragging} enableDamping={Boolean(staging) && !instant && !autoRotate && !reducedMotion.current} dampingFactor={.1} onStart={cancelMotion} autoRotate={autoRotate && !staging?.dragging} autoRotateSpeed={2} minDistance={.5} maxDistance={maxDistance} minPolarAngle={Math.PI / 180} maxPolarAngle={Math.PI / 2} />;
}

type VehicleSwap = VehicleSwapState<Resources>;
/** Everything in a scene root that is not the equipment itself. */
const SWAP_HIDDEN_GROUPS = ['Cargo', 'Supports', 'Securing', 'Weight cells', 'Center of gravity'];

/** Moves whole scene roots along the vehicle axis while the equipment is replaced. It
 * owns no cargo, plan or camera state, and every root it touched is back at the dock
 * when the replacement ends or is abandoned. */
export function ThreeVehicleSwap({ swap, arriving, shade, onDeparted, onDone }: { swap: VehicleSwap; arriving: Resources | null; shade?: { current: number }; onDeparted: (id: number) => void; onDone: (id: number) => void }) {
  const { invalidate } = useThree();
  // The ground shade under the equipment is back in full when this ends or is abandoned.
  useLayoutEffect(() => () => { if (shade) shade.current = 1; invalidate(); }, [swap.id, shade, invalidate]);
  const callbacks = useRef({ onDeparted, onDone }); callbacks.current = { onDeparted, onDone };
  const run = useRef({ id: swap.id, departed: !swap.departing, arrival: null as { root: THREE.Object3D; startMs: number } | null, done: false });
  if (run.current.id !== swap.id) run.current = { id: swap.id, departed: !swap.departing, arrival: null, done: false };
  const departingRoot = swap.departing?.root ?? null, arrivingRoot = arriving?.root ?? null;
  useLayoutEffect(() => {
    if (!departingRoot) return;
    // A changed equipment has already returned its cargo to the yard; only the equipment
    // drives off. The root is restored in full in case its scene is shown again.
    const hidden = SWAP_HIDDEN_GROUPS.flatMap(name => { const group = departingRoot.getObjectByName(name); return group?.visible ? [group] : []; });
    for (const group of hidden) group.visible = false;
    departingRoot.position.x = departingOffset(performance.now() - swap.startedAt, swap.travel, swap.from).offset;
    invalidate();
    return () => { for (const group of hidden) group.visible = true; departingRoot.position.x = 0; };
  }, [swap.id, swap.startedAt, swap.travel, swap.from, departingRoot, invalidate]);
  useLayoutEffect(() => {
    const now = run.current;
    if (!arrivingRoot || now.done) return;
    const elapsed = performance.now() - swap.startedAt;
    // It waits, unseen, for its models and for the old equipment to be gone. A scene that
    // replaces the arriving one (a result published meanwhile) continues the same arrival.
    now.arrival = { root: arrivingRoot, startMs: now.arrival?.startMs ?? arrivalStartMs(elapsed, !now.departed) };
    const arrive = arrivingOffset(elapsed, now.arrival.startMs, swap.travel);
    arrivingRoot.position.x = arrive.offset; arrivingRoot.visible = arrive.started; invalidate();
    return () => { arrivingRoot.position.x = 0; arrivingRoot.visible = true; };
  }, [swap.id, swap.startedAt, swap.travel, arrivingRoot, invalidate]);
  useFrame(() => {
    const now = run.current;
    if (now.done) return;
    const elapsed = performance.now() - swap.startedAt;
    let moving = false, atDock = 0;
    if (departingRoot && !now.departed) {
      const leave = departingOffset(elapsed, swap.travel, swap.from);
      departingRoot.position.x = leave.offset; atDock = dockShade(leave.offset, swap.travel);
      if (leave.done) { now.departed = true; callbacks.current.onDeparted(swap.id); } else moving = true;
    }
    if (now.arrival) {
      const arrive = arrivingOffset(elapsed, now.arrival.startMs, swap.travel);
      now.arrival.root.position.x = arrive.offset; now.arrival.root.visible = arrive.started;
      if (arrive.started) atDock = Math.max(atDock, dockShade(arrive.offset, swap.travel));
      if (!arrive.done) moving = true;
      else if (now.departed) { now.done = true; callbacks.current.onDone(swap.id); }
    }
    if (shade) shade.current = atDock;
    // One more frame after the last move lets the scenery read the settled shade.
    if (moving || now.done) invalidate();
  }, 0);
  return null;
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

function SceneContents({ resources, options, bindings, frameState, onHover }: { resources: Resources; options: ThreeComparisonSceneProps; bindings: WeakMap<InertiaAnimationFrame, number>; frameState: { current: FrameState };
  /** The staging unit under the pointer, or null once it is over none of this vehicle's units. */
  onHover?: (unitId: string | null) => void }) {
  const { invalidate } = useThree();
  const { plan, frameData, frameRevision, cut, shell, step, labels, weight, showCg, selected, selectedSupport } = options;
  const flying = Boolean(options.staging?.flight && !frameData && !weight);
  const [clearance, setClearance] = useState<CargoClearance | null>(null);
  const hoverCallback = useRef(onHover); hoverCallback.current = onHover;
  // A scene that goes away takes its pointer-over state with it.
  useEffect(() => () => hoverCallback.current?.(null), []);
  const selectionAt = (event: Pick<THREE.Intersection, 'object' | 'instanceId'>) => {
    const data = event.object.userData;
    if (data.kind === 'cargo') {
      const index = event.instanceId === undefined ? undefined : data.batch?.visibleIndices[event.instanceId];
      if (Number.isInteger(index) && plan.placements[index]) return { kind: 'cargo' as const, index: index as number };
    } else if (data.kind === 'support' && Number.isInteger(data.index) && plan.supports[data.index]) {
      return { kind: 'support' as const, index: data.index as number };
    }
    return null;
  };
  /** The unit a hit belongs to: a pallet carton or its base is the whole pallet. */
  const stagingTargetAt = (hit: Pick<THREE.Intersection, 'object' | 'instanceId'>): StagingPointerUnit | null => {
    if (weight || frameData || flying) return null;
    const selection = selectionAt(hit);
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
  };
  const hoverAt = (event: ThreeEvent<PointerEvent>) => {
    if (!options.staging || !onHover) return;
    // Only the nearest unit under the pointer is "over"; one behind it is not.
    const nearest = nearestStagingHit(event.intersections);
    if (!nearest) onHover(null);
    else if (stagingHitSource(nearest) === 'vehicle' && nearest.eventObject === resources.root) onHover(stagingTargetAt(nearest)?.id ?? null);
  };
  const pointerCallbacks = useRef<StagingPointerCallbacks>(null!);
  pointerCallbacks.current = {
    resolve: stagingTargetAt,
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
    <ThreeClearanceGuides plan={plan} clearance={options.clearanceVisible === false || flying ? null : clearance} axis={options.clearanceAxis ?? 'width'}/><primitive object={resources.root} dispose={null} {...pointer.handlers} onClick={handleClick} onPointerMove={(event: ThreeEvent<PointerEvent>) => { pointer.handlers.onPointerMove(event); selectCell(event); hoverAt(event); }}
    onPointerOut={(event: ThreeEvent<PointerEvent>) => { if (event.object.userData.kind === 'weightSurface') options.onCellSelect?.(null); onHover?.(null); }} /></>;
}

export function SceneRuntime({ resources, options, frameState, onPresented }: { resources: Resources | null; options: ThreeComparisonSceneProps; frameState: { current: FrameState }; onPresented?: (resources: Resources) => void }) {
  const { invalidate, gl } = useThree();
  const callbacks = useRef(options); callbacks.current = options;
  const presented = useRef(onPresented); presented.current = onPresented;
  const readyFor = useRef<{ resources: Resources; plan: ThreeComparisonPlan } | null>(null), lastStats = useRef('');
  const cameraStats = useRef<{ stable: string; sentAt: number; pending: ThreeComparisonSceneStats | null; timer: ReturnType<typeof setTimeout> | null }>({ stable: '', sentAt: 0, pending: null, timer: null });
  useEffect(() => () => { const queued = cameraStats.current; if (queued.timer !== null) clearTimeout(queued.timer); queued.timer = null; queued.pending = null; }, []);
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
    // The same resources can serve a new plan with identical content; readiness is per plan.
    if (readyFor.current?.resources !== resources || readyFor.current.plan !== options.plan) {
      readyFor.current = { resources, plan: options.plan }; callbacks.current.onReady?.(stats); presented.current?.(resources);
    }
    const signature = JSON.stringify(stats);
    if (signature !== lastStats.current) {
      lastStats.current = signature;
      // Orbiting changes only the pose and the culled draw totals. Reporting those
      // on every frame re-rendered the whole React viewer once per frame.
      const queued = cameraStats.current, now = performance.now();
      const stable = JSON.stringify({ ...stats, cameraPose: '', renderCalls: 0, triangles: 0 });
      const send = (value: ThreeComparisonSceneStats) => {
        if (queued.timer !== null) { clearTimeout(queued.timer); queued.timer = null; }
        queued.pending = null; queued.sentAt = performance.now(); callbacks.current.onStats?.(value);
      };
      if (stable !== queued.stable || now - queued.sentAt >= CAMERA_STATS_INTERVAL_MS) { queued.stable = stable; send(stats); }
      else {
        queued.pending = stats;
        // Demand rendering stops with the camera, so the final pose needs its own delivery.
        queued.timer ??= setTimeout(() => { queued.timer = null; if (queued.pending) send(queued.pending); }, Math.max(0, CAMERA_STATS_INTERVAL_MS - (now - queued.sentAt)));
      }
    }
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
  return <CameraController plan={options.plan} view={options.view} autoRotate={autoRotate} staging={options.staging} viewRequest={options.viewRequest} instant={Boolean(options.frameData || options.benchmark)} physicalTransition={options.staging?.motionEnabled === true} />;
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
  const live = useRef<{ key: string; resources: Resources; vehicleStatus: VehicleStatus; dispose: () => void } | null>(null);
  // A replaced scene lingers until its replacement has drawn; see sceneRetirement.
  const retirement = useMemo(() => createSceneRetirement(), []);
  // Replacing the equipment is shown as the old one leaving and the new one arriving.
  const [swap, setSwap] = useState<VehicleSwap | null>(null);
  const leaving = useRef<Resources | null>(null); leaving.current = swap?.departing ?? null;
  const swapNow = useRef(swap); swapNow.current = swap;
  // The live scene once it has driven off while its replacement is still loading.
  const gone = useRef<Resources | null>(null);
  const equipment = useRef<{ identity: string; length: number } | null>(null);
  const presentedLive = useRef<Resources | null>(null), swapSerial = useRef(0), dockShadeLevel = useRef(1);
  const onPresented = useCallback((shown: Resources) => {
    if (live.current?.resources !== shown) return;
    presentedLive.current = shown;
    // The equipment that is still driving off is drawn from the retired scene.
    if (!leaving.current) retirement.flush();
  }, [retirement]);
  const departed = swap ? !swap.departing : true;
  useEffect(() => { if (departed && live.current && presentedLive.current === live.current.resources) retirement.flush(); }, [departed, retirement]);
  const onDeparted = useCallback((id: number) => {
    if (swapNow.current?.id === id && swapNow.current.departing) gone.current = swapNow.current.departing;
    setSwap(value => value?.id === id ? { ...value, departing: null } : value);
  }, []);
  const onSwapDone = useCallback((id: number) => {
    if (swapNow.current?.id === id) gone.current = null;
    setSwap(value => value?.id === id ? null : value);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError(''); frameState.current = { acceptedFrameStep: null, rejectedFrame: false };
    const key = `${options.vehicleAttempt ?? 0}:${planContentKey(plan)}`;
    const current = live.current;
    // A new plan identity with unchanged content (for example a re-published
    // result) keeps its scene. A vehicle fallback still retries on the next plan.
    if (current?.key === key && current.vehicleStatus.status !== 'fallback') {
      callbacks.current.onVehicleStatus?.(current.vehicleStatus);
      // The live scene is asked for again. If it was still driving off it stays at the
      // dock; if it had left, or was waiting behind another departure, it is what arrives.
      const again = vehicleIdentity(plan); gone.current = null;
      setSwap(value => recallVehicleSwap(value, current.resources, again));
      setLoaded({ plan, resources: current.resources });
      return;
    }
    const identity = vehicleIdentity(plan), shownEquipment = equipment.current;
    if (current && shownEquipment && shownEquipment.identity !== identity) {
      const now = callbacks.current;
      const allowed = now.staging?.motionEnabled === true && !now.frameData && !now.benchmark
        && !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (allowed) {
        const scene = current.resources, alreadyGone = gone.current === scene;
        // The scene on screen leaves from where it stands, which is short of the dock if it
        // was itself still arriving.
        const fresh: VehicleSwap = { id: ++swapSerial.current, departing: scene, from: scene.root.position.x, startedAt: performance.now(),
          travel: vehicleSwapTravel(shownEquipment.length, plan.container.length), identity };
        setSwap(value => retargetVehicleSwap(value, fresh, alreadyGone));
      } else { gone.current = null; setSwap(null); }
    }
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
        const vehicleStatus: VehicleStatus = vehicle.error ? { status: 'fallback', message: vehicle.error } : { status: vehicleKeys.length ? 'ready' : 'none' };
        callbacks.current.onVehicleStatus?.(vehicleStatus);
        const previous = live.current;
        live.current = { key, resources, vehicleStatus, dispose: () => { resources.dispose(); acquired.release(); } };
        equipment.current = { identity, length: plan.container.length }; gone.current = null;
        if (previous) retirement.retire(previous.dispose);
        setLoaded({ plan, resources });
      } catch (reason) { acquired.release(); throw reason; }
    }).catch(reason => {
      void labels.then(acquired => acquired.release(), () => {});
      if (cancelled) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); callbacks.current.onError?.(message);
    });
    return () => { cancelled = true; };
  }, [plan, options.vehicleAttempt]);
  useEffect(() => () => {
    const current = live.current; live.current = null;
    current?.dispose(); retirement.flush();
  }, [retirement]);
  const resources = loaded?.plan === plan ? loaded.resources : null;
  const groundY = vehicleLayout(plan.vehicleRig ?? 'none', plan.container).groundY;
  const staging = options.staging;
  const selectedStaging = staging ? stagingVehicleSelection(plan, staging.inventory.vehicleUnits, staging.selectedUnitId) : null;
  const previewUnit = staging?.preview ? staging.inventory.units.find(unit => unit.id === staging.preview!.unitId) : null;
  // What the pointer is over. Display only: selection and drags keep their own owners.
  const [hover, setHover] = useState<StagingHover | null>(null);
  const hoverVehicle = useCallback((id: string | null) => setHover(current => nextStagingHover(current, 'vehicle', id)), []);
  const hoverYard = useCallback((id: string | null) => setHover(current => nextStagingHover(current, 'yard', id)), []);
  const canDragUnits = Boolean(staging && staging.canManipulate !== false && !options.frameData && !options.weight && !staging.flight);
  const hoveredUnit = staging && hover && !staging.dragging && !staging.preview && !staging.flight && !options.frameData && !options.weight
    ? staging.inventory.units.find(unit => unit.id === hover.id) ?? null : null;
  // The selected unit already carries its own outline.
  const outlinedHover = hoveredUnit && hoveredUnit.id !== staging?.selectedUnitId ? hover : null;
  const vehicleUnits = staging?.inventory.vehicleUnits, dragPreview = staging?.preview;
  const hoverBoxes = useMemo(() => {
    const bounds = vehicleUnits && outlinedHover?.source === 'vehicle' ? stagingUnitSceneBounds(vehicleUnits, outlinedHover.id, plan.container) : null;
    return bounds ? [bounds] : [];
  }, [vehicleUnits, outlinedHover, plan.container]);
  // Placed cargo that a rejected drag candidate runs into; the verdict itself is the command owner's.
  const conflictBoxes = useMemo(() => vehicleUnits ? stagingPreviewConflicts(vehicleUnits, dragPreview, plan.container) : [], [vehicleUnits, dragPreview, plan.container]);
  const cursor = staging ? stagingCursor({ dragging: staging.dragging, hover: hoveredUnit ? hover : null, canDrag: canDragUnits && stagingUnitDraggable(hoveredUnit) }) : '';
  return <div style={{ width: '100%', height: '100%', position: 'relative', minHeight: 180 }} data-three-scene-ready={Boolean(resources)}>
    <Canvas frameloop="demand" camera={{ fov: 40, near: .02, far: 500, position: [10, 7, 10] }} dpr={VIEWER_QUALITY_PROFILES[quality.quality].dpr} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onPointerMissed={event => { if (event.type === 'click' && event.button === 0) options.onSelect(null); }} onContextMenu={event => event.preventDefault()} fallback={<WebGLFallback onError={options.onError} />}>
      <ThreeSceneLighting quality={quality.quality} groundY={groundY} />
      <ThreeViewerEnvironment groundY={groundY} id={options.environment ?? DEFAULT_VIEWER_ENVIRONMENT} length={plan.container.length} width={plan.container.width} height={plan.container.height} attempt={options.environmentAttempt} onStatus={options.onEnvironmentStatus} contactShade={dockShadeLevel} />
      {resources && <SceneContents resources={resources} options={options} bindings={bindings.current} frameState={frameState} onHover={staging ? hoverVehicle : undefined} />}
      {swap?.departing && swap.departing !== resources && <primitive object={swap.departing.root} dispose={null} />}
      {swap && <ThreeVehicleSwap swap={swap} arriving={swap.identity === vehicleIdentity(plan) ? resources : null} shade={dockShadeLevel} onDeparted={onDeparted} onDone={onSwapDone} />}
      {staging && <ThreeStagingYard key={yardAttempt} units={staging.inventory.yardUnits} layout={staging.layout} visibleZoneIds={staging.visibleZoneIds} selectedUnitId={staging.selectedUnitId} cartonLabelsEnabled={options.labels}
        hoveredUnitId={outlinedHover?.source === 'yard' ? outlinedHover.id : null} onHover={hoverYard}
        labels={{ empty: uiText('대기 화물 없음'), aisle: uiText('이동 통로'), doorClearance: uiText('출입문 여유 공간'), boxes: uiText('낱박스'), pallets: uiText('파렛트'), pending: uiText('계산 전'), checking: uiText('검토 중'), unloaded: uiText('미적재'), error: uiText('입력·포장 확인') }}
        canDrag={staging.canManipulate !== false && !options.frameData && !options.weight && !staging.flight}
        onInspect={staging.inspectUnit} onSelect={staging.selectUnit} onDragStart={staging.onDragStart} onDragMove={staging.onDragMove} onDragEnd={staging.onDragEnd} onDraggingChange={staging.onDraggingChange} onError={setYardError} />}
      {staging && <StagingVehicleOutline bounds={staging.flight?.flights.some(flight => flight.unitId === staging.selectedUnitId) ? null : selectedStaging?.bounds ?? null} />}
      {staging?.preview && previewUnit && <ThreeStagingPreview unit={previewUnit} candidate={staging.preview.candidate} container={plan.container} valid={staging.preview.valid} onError={setYardError} />}
      {staging && <ThreeStagingOutlines name="Pointer-over vehicle staging unit" color={STAGING_HOVER_COLOR} renderOrder={7} boxes={hoverBoxes} />}
      {staging && <ThreeStagingOutlines name="Cargo a rejected drag runs into" color={STAGING_CONFLICT_COLOR} renderOrder={9} boxes={conflictBoxes} />}
      {staging && <ThreeStagingCursor cursor={cursor} />}
      <SceneRuntime resources={resources} options={options} frameState={frameState} onPresented={onPresented} />
      <ThreeRenderPipeline quality={quality.quality} ambientOcclusion={quality.ambientOcclusion} onStatus={options.onPipelineStatus} onError={setPipelineError} />
      <ThreeViewerSnapshot />
    </Canvas>
    {pipelineError && <div className="three-environment-error" role="status">{uiText('접촉 음영을 사용할 수 없어 기본 렌더링으로 표시합니다.')}</div>}
    {yardError && <div className="three-environment-error" role="status">{uiText('대기장 표시 실패')} · {yardError} <button type="button" data-view-only="true" onClick={() => { setYardError(''); setYardAttempt(value => value + 1); }}>{uiText('대기장 다시 시도')}</button></div>}
    {error && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 24, background: '#fff8f4', color: '#9f1239' }}><b>{uiText("Meshy 모델을 불러오지 못했습니다")}</b><span>{error}</span></div>}
  </div>;
}
