import type { ContainerSpec } from './engine/types';
import type { StagingInventory, StagingUnit } from './stagingInventory';
import type { StagingYardLayout, StagingYardSlot } from './stagingYardLayout';
import { DEFAULT_MOTION_OPTIONS } from './motion/CargoMotion.js';

/** App-only display timing; generic CargoMotion keeps its existing arc defaults. */
export const STAGING_FLIGHT_PROFILE = Object.freeze({
  path: 'vertical' as const, durationMs: 1500, prepareDurationMs: 300, maxStaggerMs: 600,
  liftHeight: DEFAULT_MOTION_OPTIONS.liftHeight,
  ascentRatio: DEFAULT_MOTION_OPTIONS.ascentRatio, descentRatio: DEFAULT_MOTION_OPTIONS.descentRatio,
  cruiseClearanceM: .4,
});

/** Floor-footprint center in the existing Y-up viewer world. */
export type StagingFlightPose = { position: [number, number, number]; rotationY: number };
export type StagingFlight = {
  unitId: string;
  from: StagingFlightPose;
  to: StagingFlightPose;
  durationMs: number;
  delayMs: number;
};
export type StagingFlightSequence = {
  id: number;
  inputSignature: string;
  planKey: string;
  flights: StagingFlight[];
};

const DURATION_MS = STAGING_FLIGHT_PROFILE.durationMs;
const MAX_STAGGER_MS = STAGING_FLIGHT_PROFILE.maxStaggerMs;
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const validPose = (pose: StagingFlightPose) => pose.position.length === 3
  && pose.position.every(Number.isFinite) && Number.isFinite(pose.rotationY);

function membership(unit: StagingUnit): string[] | null {
  const ids = unit.boxUnits.map(box => box.stableId);
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) return null;
  return ids.sort(lexical);
}
function membershipKey(kind: StagingUnit['kind'], ids: string[]) { return JSON.stringify([kind, ids]); }
function occurrences(units: readonly StagingUnit[], select: (unit: StagingUnit) => string[]) {
  const counts = new Map<string, number>();
  for (const unit of units) for (const id of select(unit)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
function slotsById(layout: StagingYardLayout) {
  const counts = new Map<string, number>();
  for (const slot of layout.slots) counts.set(slot.unitId, (counts.get(slot.unitId) ?? 0) + 1);
  return new Map(layout.slots.filter(slot => counts.get(slot.unitId) === 1
    && validPose({ position: slot.center, rotationY: slot.rotationY })).map(slot => [slot.unitId, slot]));
}
function acceptedPose(unit: StagingUnit, container: Pick<ContainerSpec, 'length' | 'width'>): StagingFlightPose | null {
  const source = unit.kind === 'pallet' ? unit.pallet : unit.placement;
  if (!source || ![source.x, source.y, source.z, source.length, source.width].every(Number.isFinite)
    || source.length <= 0 || source.width <= 0) return null;
  const pose: StagingFlightPose = {
    position: [source.x + source.length / 2 - container.length / 2, source.z,
      source.y + source.width / 2 - container.width / 2],
    // Accepted placement dimensions already contain the engine's orientation.
    rotationY: 0,
  };
  return validPose(pose) ? pose : null;
}

/** Display-only transitions after an accepted plan. Membership, not SKU counts
 * or array indices, proves that every member came from the previous yard.
 * Regrouped pallets require a supplied layout of those actual accepted packs.
 */
export function buildStagingFlights(previousInventory: StagingInventory, previousLayout: StagingYardLayout,
  nextInventory: StagingInventory, container: Pick<ContainerSpec, 'length' | 'width'>,
  fallbackLayout?: StagingYardLayout): StagingFlight[] {
  if (previousInventory.inputSignature !== nextInventory.inputSignature
    || ![container.length, container.width].every(value => Number.isFinite(value) && value > 0)) return [];
  const yard = previousInventory.yardUnits.filter(unit => unit.location === 'yard');
  const priorUnitIds = occurrences(yard, unit => [unit.id]);
  const priorCounts = occurrences(yard, unit => unit.boxUnits.map(box => box.stableId));
  const alreadyAssigned = new Set([...previousInventory.vehicleUnits, ...previousInventory.otherVehicleUnits]
    .flatMap(unit => unit.boxUnits.map(box => box.stableId)));
  const nextUnits = nextInventory.vehicleUnits.filter(unit => unit.location === 'vehicle');
  const nextIds = occurrences(nextUnits, unit => [unit.id]);
  const nextMembers = occurrences(nextUnits, unit => unit.boxUnits.map(box => box.stableId));
  const oldSlots = slotsById(previousLayout), fallbackSlots = fallbackLayout ? slotsById(fallbackLayout) : new Map<string, StagingYardSlot>();
  const byMembers = new Map<string, StagingYardSlot>();
  const byId = new Map<string, { key: string; slot: StagingYardSlot }>();
  for (const unit of yard.slice().sort((a, b) => lexical(a.id, b.id))) {
    const ids = membership(unit), slot = oldSlots.get(unit.id);
    if (!ids || !slot || priorUnitIds.get(unit.id) !== 1 || ids.some(id => priorCounts.get(id) !== 1 || alreadyAssigned.has(id))) continue;
    const key = membershipKey(unit.kind, ids);
    byId.set(unit.id, { key, slot });
    if (!byMembers.has(key)) byMembers.set(key, slot);
  }
  const flights: StagingFlight[] = [];
  for (const unit of nextUnits.slice().sort((a, b) => lexical(a.id, b.id))) {
    const ids = membership(unit);
    if (!unit.id || nextIds.get(unit.id) !== 1 || !ids
      || ids.some(id => priorCounts.get(id) !== 1 || alreadyAssigned.has(id) || nextMembers.get(id) !== 1)) continue;
    const key = membershipKey(unit.kind, ids), exact = byId.get(unit.id);
    const slot = (exact?.key === key ? exact.slot : undefined) ?? byMembers.get(key) ?? fallbackSlots.get(unit.id);
    const to = acceptedPose(unit, container);
    if (!slot || !to) continue;
    // Accepted instances already use the destination footprint. Undo a 90°
    // footprint swap at the dock so the displayed package matches its yard slot.
    const footprint = unit.kind === 'pallet' ? unit.pallet : unit.placement;
    const swapped = footprint && Math.abs(slot.length - footprint.width) < 1e-5
      && Math.abs(slot.width - footprint.length) < 1e-5 && Math.abs(footprint.length - footprint.width) > 1e-5;
    flights.push({ unitId: unit.id, from: { position: [...slot.center], rotationY: slot.rotationY + (swapped ? Math.PI / 2 : 0) },
      to, durationMs: DURATION_MS, delayMs: 0 });
  }
  // Spread a large batch over a bounded interval rather than extending its run.
  flights.forEach((flight, index) => { flight.delayMs = flights.length < 2 ? 0 : index * MAX_STAGGER_MS / (flights.length - 1); });
  return flights;
}

