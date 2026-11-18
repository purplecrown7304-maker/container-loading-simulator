import { INERTIA_SCENARIO_ACCELERATION_G } from './inertiaSimulation';
import type { PalletLoad, PalletSpec } from './palletPacking';

const EPS = 1e-9;

/**
 * Share of the static tipping threshold a banded pallet unit may use. At 1.0 the
 * overturning moment of the transport acceleration equals the restoring moment of
 * the unit's own weight about its pallet edge. The default is that threshold itself:
 * it mirrors the inertia certification, which a unit at 97.5% still passes, so a
 * certifiable shipment is not split over extra pallets. A stricter reserve can be
 * set with `PalletSpec.maxTipUtilizationRatio` (0 초과 1 이하).
 */
export const DEFAULT_PALLET_TIP_UTILIZATION_LIMIT = 1;

type TipLimitSpec = Pick<PalletSpec, 'length' | 'width' | 'height' | 'tareWeightKg' | 'maxTipUtilizationRatio'>;
type TipUnit = Pick<PalletLoad, 'x' | 'y' | 'z' | 'length' | 'width' | 'centerOfGravity' | 'cargoPlacements' | 'totalWeightKg' | 'stackColumn' | 'stackLevel'>;

/** Peak horizontal demand of the transport certification, per container axis, in g. */
export function palletTransportDemandG() {
  return {
    longitudinal: Math.max(INERTIA_SCENARIO_ACCELERATION_G.acceleration, INERTIA_SCENARIO_ACCELERATION_G.braking),
    lateral: INERTIA_SCENARIO_ACCELERATION_G.cornering,
  };
}

export function palletTipUtilizationLimit(spec?: { maxTipUtilizationRatio?: number }) {
  const configured = spec?.maxTipUtilizationRatio;
  return configured !== undefined && Number.isFinite(configured) && configured > 0 && configured <= 1
    ? configured : DEFAULT_PALLET_TIP_UTILIZATION_LIMIT;
}

/**
 * Overturning demand of a pallet unit load as a share of its tipping threshold.
 *
 * The inertia certification moves a fully banded pallet and its cartons as one rigid
 * unit. Such a unit starts to overturn about its pallet edge when
 * `acceleration × CG height > g × horizontal distance from the CG to that edge`.
 * Pallets stacked above it ride on the unit and add their own overturning moment, so
 * the unit is evaluated together with everything above it in the same column.
 * The value returned is the larger of the longitudinal and lateral ratios; above 1
 * the unit tips under the certification's own acceleration, however it is banded.
 * This is the same statics the simulation integrates, evaluated before it runs.
 */
export function palletTipUtilization(load: TipUnit, all: readonly TipUnit[] = [load]) {
  const carried = all.filter(other => other === load
    || (other.stackColumn === load.stackColumn && other.stackLevel > load.stackLevel));
  const mass = carried.reduce((sum, unit) => sum + Math.max(0, unit.totalWeightKg), 0);
  if (mass <= EPS || !carried.some(unit => unit.cargoPlacements.length > 0)) return 0;
  const cog = carried.reduce((sum, unit) => {
    const weight = Math.max(0, unit.totalWeightKg);
    return { x: sum.x + unit.centerOfGravity.x * weight, y: sum.y + unit.centerOfGravity.y * weight, z: sum.z + unit.centerOfGravity.z * weight };
  }, { x: 0, y: 0, z: 0 });
  const heightAboveBase = Math.max(0, cog.z / mass - load.z);
  const armX = Math.max(EPS, Math.min(cog.x / mass - load.x, load.x + load.length - cog.x / mass));
  const armY = Math.max(EPS, Math.min(cog.y / mass - load.y, load.y + load.width - cog.y / mass));
  const demand = palletTransportDemandG();
  return Math.max(demand.longitudinal * heightAboveBase / armX, demand.lateral * heightAboveBase / armY);
}

/** Pallet units that would overturn, with everything stacked on them, in the transport certification. */
export function palletTipViolations<T extends TipUnit>(pallets: readonly T[], spec?: { maxTipUtilizationRatio?: number }) {
  const limit = palletTipUtilizationLimit(spec) + 1e-6;
  return pallets.filter(load => palletTipUtilization(load, pallets) > limit);
}

/**
 * Tallest uniform cargo stack, in metres above the deck, that keeps a centred unit
 * load of the given weight density inside the tipping limit. Used only to derive a
 * lower planning profile; every built pallet is still checked with its real CG.
 */
export function tipSafeCargoHeightM(spec: TipLimitSpec, cargoWeightPerHeightKgPerM: number) {
  const demand = palletTransportDemandG();
  const maxCogHeight = palletTipUtilizationLimit(spec) * Math.min(
    spec.length / 2 / Math.max(EPS, demand.longitudinal),
    spec.width / 2 / Math.max(EPS, demand.lateral),
  );
  const density = Math.max(EPS, cargoWeightPerHeightKgPerM);
  const tare = Math.max(0, spec.tareWeightKg);
  // Unit CG = (ρh·(p + h/2) + tare·p/2) / (ρh + tare) ≤ maxCogHeight, solved for h.
  const linear = maxCogHeight - spec.height;
  const discriminant = density * density * linear * linear + 2 * density * tare * (maxCogHeight - spec.height / 2);
  if (discriminant < 0) return 0;
  return Math.max(0, (density * linear + Math.sqrt(discriminant)) / density);
}
