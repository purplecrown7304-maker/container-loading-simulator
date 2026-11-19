/** Display-only timeline for replacing the transport equipment in the viewer.
 *
 * The equipment that was on screen drives off toward its cab end, away from the staging
 * yard at the doors, and the new equipment backs in along the same line. Nothing here
 * loads, validates or moves cargo: the accepted plan and the yard are drawn by their own
 * owners, and a changed equipment has already cleared the loading result. */
export const VEHICLE_SWAP_PROFILE = Object.freeze({
  leaveMs: 1100,
  arriveMs: 1400,
  /** Camera re-fit to the new equipment, shorter than the arrival so it settles first. */
  cameraMs: 900,
  /** Far enough that the hand-over between the two happens away from the dock. */
  minTravelM: 30,
  travelPerLength: 2.5,
  /** Share of the travel over which the ground shade under the equipment fades. */
  shadeReach: .4,
});

type Physical = { container: { length: number; width: number; height: number }; vehicle?: unknown; vehicleRig?: unknown; geometry?: unknown; equipmentId?: unknown };

/** Everything that makes the drawn equipment a different piece of equipment. Cargo,
 * selection and loading results are deliberately absent. */
export function vehicleIdentity(plan: Physical): string {
  const { length, width, height } = plan.container;
  return JSON.stringify([length, width, height, plan.vehicle ?? null, plan.vehicleRig ?? null, plan.geometry ?? null, plan.equipmentId ?? null]);
}

/** Distance along the vehicle axis that takes either equipment out of the way. */
export function vehicleSwapTravel(...lengthsM: number[]): number {
  const longest = Math.max(0, ...lengthsM.filter(value => Number.isFinite(value) && value > 0));
  return Math.max(VEHICLE_SWAP_PROFILE.minTravelM, longest * VEHICLE_SWAP_PROFILE.travelPerLength);
}

/** One replacement on screen. `departing` is the scene that is driving off, null once it
 * has gone; `from` is where it stood when told to leave (0 at the dock); `identity` is
 * the equipment that is to arrive. */
export type VehicleSwapState<Scene> = { id: number; departing: Scene | null; from: number; startedAt: number; travel: number; identity: string };

/** What another equipment change does to a replacement that may already be under way.
 * A departure under way continues, and a live scene that has already left does not leave
 * twice: only what arrives changes. Otherwise the scene on screen leaves as `fresh` says. */
export function retargetVehicleSwap<Scene>(current: VehicleSwapState<Scene> | null, fresh: VehicleSwapState<Scene>, liveSceneGone: boolean): VehicleSwapState<Scene> {
  return current && (current.departing || liveSceneGone) ? { ...current, identity: fresh.identity, travel: Math.max(current.travel, fresh.travel) } : fresh;
}

/** What asking again for the live scene does. If it was still driving off, the
 * replacement is called off and it stays; if it had left, or was waiting behind another
 * departure, it becomes what arrives. */
export function recallVehicleSwap<Scene>(current: VehicleSwapState<Scene> | null, live: Scene, identity: string): VehicleSwapState<Scene> | null {
  if (!current || current.departing === live) return null;
  return current.identity === identity ? current : { ...current, identity };
}

const clamp01 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
/** Pulls away slowly, as a vehicle starting from rest. */
const pullAway = (t: number) => t * t * t;
/** Slows into the dock, as a vehicle coming to rest. */
const settle = (t: number) => 1 - Math.pow(1 - t, 3);

/** X offset of the equipment that leaves: where it stood at the start (0 at the dock, or
 * part-way in if it was itself still arriving), -travel when gone. */
export function departingOffset(elapsedMs: number, travelM: number, fromM = 0): { offset: number; done: boolean } {
  const progress = clamp01(elapsedMs / VEHICLE_SWAP_PROFILE.leaveMs);
  const from = Number.isFinite(fromM) ? Math.min(0, Math.max(-travelM, fromM)) : 0;
  return { offset: progress === 1 ? -travelM : from - (travelM + from) * pullAway(progress), done: progress === 1 };
}

/** Strength of the ground shade at the dock for equipment standing `offsetM` away from
 * it: 1 on its footprint, 0 once it is clear of it. */
export function dockShade(offsetM: number, travelM: number): number {
  const reach = travelM * VEHICLE_SWAP_PROFILE.shadeReach;
  return Number.isFinite(offsetM) && reach > 0 ? Math.max(0, 1 - Math.abs(offsetM) / reach) : 1;
}

/** When the arriving equipment may start, measured on the same clock as the departure.
 * It waits for its models and, if something is leaving, for that to be gone: both use
 * the same lane, so they are never on it together. */
export function arrivalStartMs(readyAtMs: number, somethingLeaves: boolean): number {
  const ready = Number.isFinite(readyAtMs) ? Math.max(0, readyAtMs) : 0;
  return somethingLeaves ? Math.max(ready, VEHICLE_SWAP_PROFILE.leaveMs) : ready;
}

/** X offset of the equipment that arrives: -travel and not yet shown before it starts,
 * exactly 0 at the dock. */
export function arrivingOffset(elapsedMs: number, startMs: number, travelM: number): { offset: number; started: boolean; done: boolean } {
  const started = Number.isFinite(elapsedMs) && elapsedMs >= startMs;
  const progress = started ? clamp01((elapsedMs - startMs) / VEHICLE_SWAP_PROFILE.arriveMs) : 0;
  return { offset: progress === 1 ? 0 : -travelM * (1 - settle(progress)), started, done: progress === 1 };
}
