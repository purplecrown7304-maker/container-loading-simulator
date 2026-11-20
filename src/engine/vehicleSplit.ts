import type { CargoItem } from './types';

/**
 * Cargo that does not fit one vehicle is divided evenly over several (AGENTS.md 2L).
 *
 * The split only decides which cartons travel in which vehicle. Every vehicle is then
 * planned, checked and certified as a job of its own by the unchanged planners, so no
 * limit and no certification threshold is touched here.
 */

/** Fewest and most vehicles one job is divided over. Fixed bounds of the split, not safety limits. */
export const MIN_SPLIT_VEHICLES = 2;
export const MAX_SPLIT_VEHICLES = 6;

function wholeUnits(quantity: number) {
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
}

function lineWeight(item: CargoItem) {
  return Number.isFinite(item.weightKg) && item.weightKg > 0 ? item.weightKg : 0;
}

export function isSplitVehicleCount(vehicleCount: number) {
  return Number.isInteger(vehicleCount) && vehicleCount >= MIN_SPLIT_VEHICLES && vehicleCount <= MAX_SPLIT_VEHICLES;
}

/** Cartons of the lines a plan can load: whole, positive quantities only. */
export function cargoUnitCount(cargo: readonly CargoItem[]): number {
  return cargo.reduce((sum, item) => sum + wholeUnits(item.quantity), 0);
}

export function cargoWeightKg(cargo: readonly CargoItem[]): number {
  return cargo.reduce((sum, item) => sum + wholeUnits(item.quantity) * lineWeight(item), 0);
}

/**
 * Divides every cargo line into equal whole shares, one share per vehicle.
 *
 * - A line of q cartons gives each of the N vehicles floor(q / N).
 * - The cartons that do not divide are handed out one at a time, heaviest line first
 *   (equal weights: the smaller id first), each to the vehicle that is lightest so far
 *   (equal weights: the earlier vehicle). The vehicles therefore end within one carton of
 *   each other in every line and as close in weight as whole cartons allow.
 * - Lines keep their order and every other field. A vehicle gets no line of which it
 *   carries nothing.
 * - A line whose quantity is not a positive whole number is not divided: it stays whole
 *   in vehicle 1, where input validation reports it exactly as it does without a split.
 *
 * The result depends on the input only.
 */
export function splitCargoEvenly(cargo: readonly CargoItem[], vehicleCount: number): CargoItem[][] {
  if (!isSplitVehicleCount(vehicleCount)) {
    throw new RangeError(`vehicleCount must be a whole number from ${MIN_SPLIT_VEHICLES} to ${MAX_SPLIT_VEHICLES}`);
  }
  const quantities = cargo.map(item => {
    const units = wholeUnits(item.quantity);
    return Array.from({ length: vehicleCount }, () => Math.floor(units / vehicleCount));
  });
  const vehicleWeight = Array.from({ length: vehicleCount }, (_, vehicle) =>
    cargo.reduce((sum, item, line) => sum + quantities[line][vehicle] * lineWeight(item), 0));

  const order = cargo.map((_, line) => line).sort((a, b) =>
    lineWeight(cargo[b]) - lineWeight(cargo[a]) || cargo[a].id.localeCompare(cargo[b].id) || a - b);
  for (const line of order) {
    const leftover = wholeUnits(cargo[line].quantity) % vehicleCount;
    // One vehicle never takes two of the same line's leftover cartons.
    const taken = new Set<number>();
    for (let carton = 0; carton < leftover; carton += 1) {
      let lightest = -1;
      for (let vehicle = 0; vehicle < vehicleCount; vehicle += 1) {
        if (taken.has(vehicle)) continue;
        if (lightest < 0 || vehicleWeight[vehicle] < vehicleWeight[lightest] - 1e-9) lightest = vehicle;
      }
      taken.add(lightest);
      quantities[line][lightest] += 1;
      vehicleWeight[lightest] += lineWeight(cargo[line]);
    }
  }

  return Array.from({ length: vehicleCount }, (_, vehicle) => cargo.flatMap((item, line) => {
    if (wholeUnits(item.quantity) === 0) return vehicle === 0 && item.quantity !== 0 ? [{ ...item }] : [];
    const quantity = quantities[line][vehicle];
    return quantity > 0 ? [{ ...item, quantity }] : [];
  }));
}

/** A split is offered only when every vehicle would carry at least one carton. */
export function canSplitInto(cargo: readonly CargoItem[], vehicleCount: number): boolean {
  if (!isSplitVehicleCount(vehicleCount) || cargoUnitCount(cargo) < vehicleCount) return false;
  return splitCargoEvenly(cargo, vehicleCount).every(share => cargoUnitCount(share) > 0);
}
