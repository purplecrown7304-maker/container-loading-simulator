import { Box3, Vector3 } from 'three';
import type { TransportEquipment } from './transportEquipment';

/** Display-only. Never passed to Unity, Rapier, loading or certification inputs. */
export type VehicleRigKind = 'articulated' | 'rigid' | 'none';
export type VehicleModelKey = 'cab' | 'tractor' | 'truck-underbody' | 'container-chassis';
export type VehicleFootprint = { length: number; width: number; height: number };
export type RailFit = { minX: number; maxX: number; start: number; end: number; targetLength: number; rearStart?: number; rearEnd?: number; rearSpan?: number; preserveLegs?: boolean };
export type VehiclePlacement = { key: VehicleModelKey; scale: number; position: [number, number, number]; rails?: RailFit };

// Measured from the four uploaded GLBs. Y is up, -X is front; no OBJ reflection.
// Cab bounds exclude only the disconnected rear spare tire in the derived asset.
export const VEHICLE_BOUNDS: Record<VehicleModelKey, { min: [number, number, number]; max: [number, number, number] }> = {
  cab: { min: [-.9458140135, -.7922639251, -.7339370251], max: [.715034008, .7863590121, .7321860194] },
  tractor: { min: [-.9520850182, -.5064610839, -.4165219963], max: [.9507579803, .4708440006, .4140000045] },
  'truck-underbody': { min: [-.9523359537, -.1381949782, -.3313519955], max: [.9503779411, .1381939948, .3332639635] },
  'container-chassis': { min: [-.9516379833, -.1206570119, -.2223069966], max: [.9528430104, .1196880117, .2217819989] },
};
const SEMITRAILERS = new Set(['mega-trailer', 'jumbo']);
export function vehicleRigForEquipment(equipment: Pick<TransportEquipment, 'id' | 'category' | 'length'>): VehicleRigKind {
  if (equipment.category === 'container' || SEMITRAILERS.has(equipment.id)) return 'articulated';
  // A road-truck selection uses the uploaded cab + truck underbody even when
  // its editable cargo length exceeds 8m. Length is not a vehicle-type signal.
  // Jumbo remains the existing continuous-space approximation, not two physics bodies.
  return 'rigid';
}
export const VEHICLE_DECK_Y = -.115;

/** Only the bare rail span changes length. Wheels, end plates and axle groups
 * retain a uniform physical scale at every container length. */
function railKnots(fit: RailFit, scale: number): [number, number][] {
  const min = -fit.targetLength / 2, max = fit.targetLength / 2;
  const frontEnd = min + (fit.start - fit.minX) * scale;
  const rear: [number, number][] = fit.rearStart !== undefined && fit.rearEnd !== undefined
    ? [[fit.rearStart, max - (fit.maxX - fit.rearEnd) * scale - fit.rearSpan!], [fit.rearEnd, max - (fit.maxX - fit.rearEnd) * scale], [fit.maxX, max]]
    : [[fit.maxX, max]];
  const rearStart = rear[0][1] - (rear[0][0] - fit.end) * scale;
  const knots: [number, number][] = [[fit.minX, min], [fit.start, frontEnd]];
  if (fit.preserveLegs) {
    const free = rearStart - frontEnd - .10 * scale;
    const before = (-.49 - fit.start) / (fit.end - fit.start - .10) * free;
    knots.push([-.49, frontEnd + before], [-.39, frontEnd + before + .10 * scale]);
  }
  return [...knots, [fit.end, rearStart], ...rear];
}
export function fittedRailX(x: number, fit: RailFit, scale: number): number {
  const knots = railKnots(fit, scale);
  for (let i = 1; i < knots.length; i++) if (x <= knots[i][0] || i === knots.length - 1) {
    const [a, b] = [knots[i - 1], knots[i]];
    return a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
  }
  return x * scale;
}
export function railXSlope(x: number, fit: RailFit, scale: number): number {
  const knots = railKnots(fit, scale);
  for (let i = 1; i < knots.length; i++) if (x <= knots[i][0] || i === knots.length - 1) return (knots[i][1] - knots[i - 1][1]) / (knots[i][0] - knots[i - 1][0]);
  return scale;
}
export function vehicleLayout(kind: VehicleRigKind, footprint: VehicleFootprint) {
  const { length, width } = footprint;
  if (![length, width, footprint.height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Vehicle requires finite positive dimensions');
  if (kind === 'none') return { placements: [] as VehiclePlacement[], groundY: -.14, bounds: new Box3() };
  const articulated = kind === 'articulated';
  const bodyKey: VehicleModelKey = articulated ? 'container-chassis' : 'truck-underbody';
  const body = VEHICLE_BOUNDS[bodyKey], frontKey: VehicleModelKey = articulated ? 'tractor' : 'cab', front = VEHICLE_BOUNDS[frontKey];
  let frontScale = Math.min(width / (front.max[2] - front.min[2]), articulated ? 3.15 : 1.75);
  // A rigid ladder frame continues beneath the cab to its front axle. Moving
  // this bare front rail span does not move the rear axle or cargo coordinates.
  const frontExtension = articulated ? 0 : (front.max[0] - front.min[0]) * frontScale * .60 + .16;
  const targetLength = length + .12 + frontExtension;
  const rails: RailFit = { minX: body.min[0], maxX: body.max[0], start: -.87, end: 0, targetLength, preserveLegs: articulated };
  const fixedSpan = rails.start - rails.minX + rails.maxX - rails.end + (articulated ? .10 : 0);
  // Extreme custom dimensions uniformly shrink the complete running gear instead
  // of inverting a rail segment or stretching a tire into an oval.
  const bodyScale = Math.min(width * (articulated ? 1 : .90) / (body.max[2] - body.min[2]), targetLength * .90 / fixedSpan);
  if (articulated) {
    // Rear overhang is bare rail beyond the last mudguard. Compact it on short
    // 20FT equipment, preserving the complete three-axle group and rear bumper.
    rails.rearStart = .72; rails.rearEnd = .91;
    rails.rearSpan = Math.min(.19 * bodyScale, .12 + Math.max(0, length - 6.1) * .30);
  }
  // Very short/wide custom containers also shrink the complete tractor. The
  // rear fifth-wheel/axle deck must remain below the cargo floor at every size.
  if (articulated) frontScale = Math.min(frontScale, (body.max[1] - body.min[1]) * bodyScale / .39);
  const groundY = VEHICLE_DECK_Y - (body.max[1] - body.min[1]) * bodyScale;
  const frontY = groundY - front.min[1] * frontScale;
  // All tractor vertices above chassis level terminate at this measured cab plane.
  // Rear tractor axles/fifth wheel can sit under the trailer, never in cargo space.
  const cabRearX = articulated ? -.3011860251 : front.max[0];
  const placements: VehiclePlacement[] = [
    { key: bodyKey, scale: bodyScale, position: [-frontExtension / 2, VEHICLE_DECK_Y - body.max[1] * bodyScale, -(body.min[2] + body.max[2]) / 2 * bodyScale], rails },
    { key: frontKey, scale: frontScale, position: [-length / 2 - (articulated ? width * .60 : .16) - cabRearX * frontScale, frontY, -(front.min[2] + front.max[2]) / 2 * frontScale] },
  ];
  const bounds = new Box3();
  for (const placement of placements) {
    const source = VEHICLE_BOUNDS[placement.key];
    const min = new Vector3(...source.min).multiplyScalar(placement.scale).add(new Vector3(...placement.position));
    const max = new Vector3(...source.max).multiplyScalar(placement.scale).add(new Vector3(...placement.position));
    if (placement.rails) { min.x = -targetLength / 2 + placement.position[0]; max.x = targetLength / 2 + placement.position[0]; }
    bounds.union(new Box3(min, max));
  }
  return { placements, groundY, bounds };
}
