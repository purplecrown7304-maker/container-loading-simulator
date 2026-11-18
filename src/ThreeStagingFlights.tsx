import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Matrix4, Vector3 } from 'three';
import { CargoMotion } from './motion/CargoMotion.js';
import { STAGING_FLIGHT_PROFILE, type StagingFlight, type StagingFlightSequence } from './stagingFlights';
import { stagingVehicleSelection, type ThreeComparisonPlan } from './threeComparisonSceneState';
import type { StagingUnit } from './stagingInventory';
import type { createComparisonSceneResources, DisplayFlightTransform } from './threeComparisonSceneResources';

type Resources = ReturnType<typeof createComparisonSceneResources>;
export type ThreeStagingFlightsProps = {
  resources: Resources;
  plan: ThreeComparisonPlan;
  units: readonly StagingUnit[];
  sequence: StagingFlightSequence | null;
  suspended?: boolean;
  onComplete: (id: number) => void;
};
type MotionPose = { x: number; y: number; z: number; ry: number };
type BoundFlight = { flight: StagingFlight; display: DisplayFlightTransform; inverseDestination: Matrix4; pose?: MotionPose };
type FlightTimeline = { id: number; motion: CargoMotion; poses: Map<string, MotionPose>; retired: boolean };
type ActiveFlight = { resources: Resources; sequence: StagingFlightSequence; bindings: BoundFlight[]; displays: DisplayFlightTransform[]; timeline: FlightTimeline };
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5;

/** Resolve the current accepted plan once, using identity before any adapter index.
 * Reordering a plan cannot send an old array index to the new scene resources. */
function bindFlights(plan: ThreeComparisonPlan, units: readonly StagingUnit[], sequence: StagingFlightSequence): BoundFlight[] | null {
  const byUnit = new Map(units.filter(unit => unit.location === 'vehicle').map(unit => [unit.id, unit]));
  const byBox = new Map<string, number>();
  for (const [index, box] of plan.placements.entries()) if (box.unitId) {
    if (byBox.has(box.unitId)) return null;
    byBox.set(box.unitId, index);
  }
  const cargoUsed = new Set<number>(), supportUsed = new Set<number>(), unitUsed = new Set<string>();
  const bindings: BoundFlight[] = [];
  for (const flight of sequence.flights) {
    const unit = byUnit.get(flight.unitId);
    if (!unit || unitUsed.has(unit.id) || !unit.boxUnits.length) return null;
    unitUsed.add(unit.id);
    const hinted = unit.kind === 'box' ? [unit.sourcePlacementIndex] : unit.sourcePlacementIndexes ?? [];
    const cargoIndices = unit.boxUnits.map((box, member) => {
      const identity = byBox.get(box.id);
      if (identity !== undefined) return plan.placements[identity].cargoId === box.cargoId ? identity : -1;
      const index = hinted[member], actual = index === undefined ? undefined : plan.placements[index];
      const expected = unit.kind === 'box' ? unit.placement : unit.pallet?.cargoPlacements[member];
      return index !== undefined && actual && !actual.unitId && actual.cargoId === box.cargoId && expected
        && ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => close(actual[key as 'x'], expected[key as 'x'])) ? index : -1;
    });
    if (cargoIndices.some(index => index < 0 || cargoUsed.has(index)) || new Set(cargoIndices).size !== cargoIndices.length) return null;
    cargoIndices.forEach(index => cargoUsed.add(index));
    const selection = stagingVehicleSelection(plan, [unit], unit.id);
    const supportIndex = unit.kind === 'pallet' ? selection.supportIndex : null;
    if (unit.kind === 'pallet' && (supportIndex === null || supportUsed.has(supportIndex))) return null;
    if (supportIndex !== null) supportUsed.add(supportIndex);
    const destination = supportIndex !== null ? plan.supports[supportIndex] : plan.placements[cargoIndices[0]];
    const position = [destination.x + destination.length / 2 - plan.container.length / 2,
      destination.z, destination.y + destination.width / 2 - plan.container.width / 2];
    // The engine's accepted dimensions already embody carton orientation.
    if (!position.every((value, axis) => close(value, flight.to.position[axis])) || !close(flight.to.rotationY, 0)) return null;
    bindings.push({ flight, display: { cargoIndices, supportIndex, matrix: new Matrix4() },
      inverseDestination: new Matrix4().makeRotationY(flight.to.rotationY).setPosition(...flight.to.position).invert() });
  }
  return bindings;
}

/** Moves only the accepted scene's display matrices. It never publishes a load,
 * changes quantities or duplicates a physical box/pallet with a second mesh. */
export default function ThreeStagingFlights({ resources, plan, units, sequence, suspended = false, onComplete }: ThreeStagingFlightsProps) {
  const { invalidate, scene, camera, controls } = useThree();
  const completeCallback = useRef(onComplete); completeCallback.current = onComplete;
  const active = useRef<ActiveFlight | null>(null);
  const completed = useRef(new Set<number>());
  const timeline = useRef<FlightTimeline | null>(null);
  const reducedMotion = useRef(false);
  const complete = (id: number) => {
    if (completed.current.has(id)) return;
    completed.current.add(id); completeCallback.current(id);
  };
  const retire = (clock: FlightTimeline) => {
    if (clock.retired) return;
    clock.retired = true;
    clock.motion.skip(); clock.motion.dispose();
    if (timeline.current === clock) timeline.current = null;
    complete(clock.id);
  };
  const finish = (run: ActiveFlight) => {
    run.resources.applyDisplayFlights([]);
    if (active.current === run) active.current = null;
    retire(run.timeline);
    invalidate();
  };
  const display = (run: ActiveFlight) => {
    for (let index = 0; index < run.bindings.length; index++) {
      const binding = run.bindings[index];
      const pose = binding.pose!;
      binding.display.matrix.makeRotationY(pose.ry).setPosition(pose.x, pose.y, pose.z).multiply(binding.inverseDestination);
    }
    run.resources.applyDisplayFlights(run.displays);
  };
  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      reducedMotion.current = preference.matches;
      if (preference.matches && active.current) finish(active.current);
    };
    reducedMotion.current = preference.matches;
    preference.addEventListener?.('change', change);
    return () => preference.removeEventListener?.('change', change);
  }, [invalidate]);
  useLayoutEffect(() => {
    if (timeline.current && timeline.current.id !== sequence?.id) retire(timeline.current);
    if (!sequence) { resources.applyDisplayFlights([]); return; }
    if (completed.current.has(sequence.id) || suspended || reducedMotion.current || !sequence.flights.length) {
      if (timeline.current) retire(timeline.current);
      resources.applyDisplayFlights([]); invalidate(); complete(sequence.id); return;
    }
    const bindings = bindFlights(plan, units, sequence);
    if (!bindings) {
      if (timeline.current) retire(timeline.current);
      resources.applyDisplayFlights([]); invalidate(); complete(sequence.id); return;
    }
    if (!timeline.current) {
      const poses = new Map<string, MotionPose>();
      const dockSlots = new Map<string, MotionPose>();
      for (const { flight } of bindings) {
        poses.set(flight.unitId, { x: flight.to.position[0], y: flight.to.position[1], z: flight.to.position[2], ry: flight.to.rotationY });
        dockSlots.set(flight.unitId, { x: flight.from.position[0], y: flight.from.position[1], z: flight.from.position[2], ry: flight.from.rotationY });
      }
      const adapter = {
        getPose: (id: string | number, output: MotionPose) => {
          const pose = poses.get(String(id)); if (!pose) return false;
          output.x = pose.x; output.y = pose.y; output.z = pose.z; output.ry = pose.ry; return true;
        },
        setPose: (id: string | number, value: MotionPose) => {
          const pose = poses.get(String(id)); if (!pose) return false;
          pose.x = value.x; pose.y = value.y; pose.z = value.z; pose.ry = value.ry; return true;
        },
      };
      try {
        let cruiseY = plan.container.height + STAGING_FLIGHT_PROFILE.cruiseClearanceM;
        for (const { flight } of bindings) cruiseY = Math.max(cruiseY,
          flight.from.position[1] + STAGING_FLIGHT_PROFILE.liftHeight, flight.to.position[1] + STAGING_FLIGHT_PROFILE.liftHeight);
        const motion = new CargoMotion({ scene, camera, controls, options: { adapter, dockSlots,
          path: STAGING_FLIGHT_PROFILE.path,
          prepareDuration: STAGING_FLIGHT_PROFILE.prepareDurationMs / 1000,
          liftHeight: STAGING_FLIGHT_PROFILE.liftHeight,
          ascentRatio: STAGING_FLIGHT_PROFILE.ascentRatio, descentRatio: STAGING_FLIGHT_PROFILE.descentRatio,
          cruiseY,
          rig: { root: resources.root, wheels: [], wheelRadius: 1, doorPoint: new Vector3(plan.container.length / 2, 0, 0), parkX: 0, offX: 0 },
          loadDuration: bindings[0].flight.durationMs / 1000,
          loadStagger: bindings.length > 1 ? (bindings[1].flight.delayMs - bindings[0].flight.delayMs) / 1000 : 0,
          replanDuration: bindings[0].flight.durationMs / 1000,
          replanStagger: bindings.length > 1 ? (bindings[1].flight.delayMs - bindings[0].flight.delayMs) / 1000 : 0,
          onInvalidate: invalidate } });
        const clock: FlightTimeline = { id: sequence.id, motion, poses, retired: false };
        timeline.current = clock;
        void motion.replan({ fromPlan: { units: [] }, toPlan: { units: bindings.map(({ flight }) => ({
          id: flight.unitId, object3D: resources.root,
          pose: { x: flight.to.position[0], y: flight.to.position[1], z: flight.to.position[2], ry: flight.to.rotationY }, stop: 0,
        })) } }).catch(() => {
          if (active.current?.timeline === clock) finish(active.current);
          else retire(clock);
        });
      } catch {
        if (timeline.current) retire(timeline.current);
        resources.applyDisplayFlights([]); invalidate(); complete(sequence.id); return;
      }
    }
    const clock = timeline.current;
    for (const binding of bindings) binding.pose = clock.poses.get(binding.flight.unitId);
    if (bindings.some(binding => !binding.pose)) {
      retire(clock); resources.applyDisplayFlights([]); invalidate(); complete(sequence.id); return;
    }
    const run: ActiveFlight = { resources, sequence, bindings, displays: bindings.map(binding => binding.display), timeline: clock };
    active.current = run;
    display(run); invalidate();
    return () => {
      resources.applyDisplayFlights([]);
      if (active.current === run) active.current = null;
      invalidate();
      // StrictMode immediately sets up the same sequence again. Restore matrices
      // synchronously, but only finish a genuinely retired/unmounted sequence.
      queueMicrotask(() => { if (active.current?.timeline !== clock) retire(clock); });
    };
  }, [resources, plan, units, sequence, suspended, invalidate, scene, camera, controls]);
  useFrame((_state, dt) => {
    const run = active.current;
    if (!run) return;
    run.timeline.motion.update(dt);
    if (!run.timeline.motion.isBusy) { finish(run); return; }
    display(run); invalidate();
  }, 0);
  return null;
}
