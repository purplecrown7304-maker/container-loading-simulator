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

/** A unit that stays in the vehicle and only changes its place: a short hop, not the
 * over-the-wall flight from the yard. Each unit rises this far above the higher of its
 * two floors, so a carton two tiers up does not climb to the roof to move one row. */
export const STAGING_RELOCATION_PROFILE = Object.freeze({
  path: 'vertical' as const, durationMs: 900, prepareDurationMs: 0, maxStaggerMs: 400,
  liftHeight: .35, ascentRatio: .3, descentRatio: .3,
});

/** Floor-footprint center in the existing Y-up viewer world. */
export type StagingFlightPose = { position: [number, number, number]; rotationY: number };
export type StagingFlight = {
  unitId: string;
  from: StagingFlightPose;
  to: StagingFlightPose;
  durationMs: number;
  delayMs: number;
  /** Present only on a move inside the vehicle; a flight from the yard has no kind. */
  kind?: 'relocate';
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

type Footprint = { x: number; y: number; z: number; length: number; width: number; height?: number };
const SAME = 1e-5;
const near = (a: number, b: number) => Math.abs(a - b) <= SAME;
const footprintOf = (unit: StagingUnit): Footprint | undefined => unit.kind === 'pallet' ? unit.pallet : unit.placement;
const samePlace = (a: Footprint, b: Footprint) => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z)
  && near(a.length, b.length) && near(a.width, b.width);
/** The destination instance is drawn with its own footprint. Starting it a quarter turn
 * away shows the footprint it had before, when the two differ only by that turn. */
const quarterTurn = (from: Footprint, to: Footprint) => near(from.length, to.width) && near(from.width, to.length)
  && !near(to.length, to.width) ? Math.PI / 2 : 0;
const byPlace = (a: Footprint, b: Footprint) => a.x - b.x || a.y - b.y || a.z - b.z;

/** Moves inside the vehicle between two accepted plans of the same input.
 *
 * A pallet is followed by its exact members. Loose cartons of one cargo row and one size
 * are the same goods, so a carton whose place is still occupied by such a carton is not
 * moved, and the rest are paired in position order. This only chooses where the display
 * starts: every unit is drawn, counted and identified by the accepted plan alone. */
function relocationStarts(previous: readonly StagingUnit[], next: readonly StagingUnit[],
  container: Pick<ContainerSpec, 'length' | 'width'>): Map<string, StagingFlightPose> {
  const starts = new Map<string, StagingFlightPose>();
  const start = (unit: StagingUnit, from: StagingUnit) => {
    const before = footprintOf(from), after = footprintOf(unit), pose = acceptedPose(from, container);
    if (!before || !after || !pose || samePlace(before, after)) return;
    starts.set(unit.id, { position: pose.position, rotationY: quarterTurn(before, after) });
  };
  const pallets = new Map<string, StagingUnit>();
  for (const unit of previous) if (unit.kind === 'pallet') {
    const ids = membership(unit);
    if (ids) pallets.set(membershipKey(unit.kind, ids), unit);
  }
  const looseKey = (unit: StagingUnit) => {
    const place = unit.placement;
    if (unit.kind !== 'box' || unit.boxUnits.length !== 1 || !place || !Number.isFinite(place.height)) return null;
    const sides = [place.length, place.width].sort((a, b) => a - b).map(value => Math.round(value / SAME));
    return JSON.stringify([unit.boxUnits[0].cargoId, sides, Math.round(place.height! / SAME)]);
  };
  const loose = new Map<string, { before: StagingUnit[]; after: StagingUnit[] }>();
  const group = (key: string) => { let entry = loose.get(key); if (!entry) loose.set(key, entry = { before: [], after: [] }); return entry; };
  for (const unit of previous) { const key = looseKey(unit); if (key) group(key).before.push(unit); }
  for (const unit of next) {
    if (unit.kind === 'pallet') {
      const ids = membership(unit), from = ids ? pallets.get(membershipKey(unit.kind, ids)) : undefined;
      if (from) start(unit, from);
      continue;
    }
    const key = looseKey(unit);
    if (key) group(key).after.push(unit);
  }
  // One lookup per carton: a full container holds thousands of cartons of one row.
  const placeKey = (unit: StagingUnit) => { const p = unit.placement!; return [p.x, p.y, p.z, p.length, p.width].map(value => Math.round(value / SAME)).join(); };
  const ordered = (units: StagingUnit[]) => units.sort((a, b) => byPlace(a.placement!, b.placement!) || lexical(a.id, b.id));
  for (const { before, after } of loose.values()) {
    const occupied = new Set(before.map(placeKey)), kept = new Set(after.map(placeKey));
    const free = ordered(before.filter(unit => !kept.has(placeKey(unit))));
    const moved = ordered(after.filter(unit => !occupied.has(placeKey(unit))));
    moved.forEach((unit, index) => { if (free[index]) start(unit, free[index]); });
  }
  return starts;
}

/** Display-only transitions after an accepted plan. Membership, not SKU counts
 * or array indices, proves that every member came from the previous yard.
 * Regrouped pallets require a supplied layout of those actual accepted packs.
 * A unit that was already in the vehicle and is given another place there is
 * shown hopping to it; one that keeps its place is left alone.
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
  // Units that were in this vehicle before and still are: each member exactly once on
  // both sides and never also waiting in the yard.
  const here = previousInventory.vehicleUnits.filter(unit => unit.location === 'vehicle');
  const hereCounts = occurrences(here, unit => unit.boxUnits.map(box => box.stableId));
  const settled = (unit: StagingUnit) => {
    const ids = membership(unit);
    return Boolean(ids && ids.every(id => hereCounts.get(id) === 1 && !priorCounts.has(id)));
  };
  const starts = relocationStarts(here.filter(settled), nextUnits.filter(unit => unit.id && nextIds.get(unit.id) === 1
    && settled(unit) && unit.boxUnits.every(box => nextMembers.get(box.stableId) === 1)), container);
  const flights: StagingFlight[] = [];
  for (const unit of nextUnits.slice().sort((a, b) => lexical(a.id, b.id))) {
    const ids = membership(unit);
    const start = starts.get(unit.id);
    if (start) {
      const to = acceptedPose(unit, container);
      if (to) flights.push({ unitId: unit.id, from: start, to, durationMs: DURATION_MS, delayMs: 0, kind: 'relocate' });
      continue;
    }
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
  // One timeline drives the whole batch, so every flight shares one duration. Hops keep the
  // short profile only when nothing comes from the yard in the same batch.
  const hops = flights.length > 0 && flights.every(flight => flight.kind === 'relocate');
  const stagger = hops ? STAGING_RELOCATION_PROFILE.maxStaggerMs : MAX_STAGGER_MS;
  // Spread a large batch over a bounded interval rather than extending its run.
  flights.forEach((flight, index) => {
    if (hops) flight.durationMs = STAGING_RELOCATION_PROFILE.durationMs;
    flight.delayMs = flights.length < 2 ? 0 : index * stagger / (flights.length - 1);
  });
  return flights;
}

