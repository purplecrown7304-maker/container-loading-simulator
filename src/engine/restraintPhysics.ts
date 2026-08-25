import type { PhysicsSupport } from './physicsValidation';
import type { Placement } from './types';

const EPS = 1e-6;
const G = 9.81;

export type RestraintModel = {
  /** Horizontal restoring acceleration produced per metre of relative displacement (s^-2). */
  springAccelerationPerM: number;
  /** Horizontal velocity damping coefficient (s^-1). */
  dampingPerSecond: number;
  /** Maximum horizontal restraint capacity expressed as equivalent g. */
  maxAccelerationG: number;
};

export type HorizontalState = { x: number; z: number };

export function horizontalRestraintForce(
  massKg: number,
  current: HorizontalState,
  target: HorizontalState,
  velocity: HorizontalState,
  targetVelocity: HorizontalState,
  model?: RestraintModel,
) {
  if (!model || massKg <= 0) return { x: 0, z: 0, magnitudeN: 0 };
  const dx = current.x - target.x;
  const dz = current.z - target.z;
  const dvx = velocity.x - targetVelocity.x;
  const dvz = velocity.z - targetVelocity.z;
  let ax = -model.springAccelerationPerM * dx - model.dampingPerSecond * dvx;
  let az = -model.springAccelerationPerM * dz - model.dampingPerSecond * dvz;
  const magnitude = Math.hypot(ax, az);
  const maxAcceleration = Math.max(0, model.maxAccelerationG) * G;
  if (magnitude > maxAcceleration && magnitude > EPS) {
    const scale = maxAcceleration / magnitude;
    ax *= scale;
    az *= scale;
  }
  const x = ax * massKg;
  const z = az * massKg;
  return { x, z, magnitudeN: Math.hypot(x, z) };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function overlapRatio(
  item: Pick<PhysicsSupport, 'x' | 'y' | 'length' | 'width'>,
  candidate: Pick<PhysicsSupport, 'x' | 'y' | 'length' | 'width'>,
) {
  const overlapX = overlap1d(item.x, item.x + item.length, candidate.x, candidate.x + candidate.length);
  const overlapY = overlap1d(item.y, item.y + item.width, candidate.y, candidate.y + candidate.width);
  return overlapX * overlapY / Math.max(EPS, item.length * item.width);
}

/**
 * Maps cargo to the highest pallet/support below it. This is important for stacked pallets:
 * upper-pallet cargo follows the upper pallet rather than being tied to the floor or lower pallet.
 */
export function supportingIndexForPlacement(placement: Placement, supports: PhysicsSupport[]) {
  let bestIndex = -1;
  let bestTop = -Infinity;
  const footprint = Math.max(EPS, placement.length * placement.width);
  supports.forEach((support, index) => {
    const supportTop = support.z + support.height;
    if (supportTop > placement.z + 0.01) return;
    const overlapX = overlap1d(placement.x, placement.x + placement.length, support.x, support.x + support.length);
    const overlapY = overlap1d(placement.y, placement.y + placement.width, support.y, support.y + support.width);
    if (overlapX * overlapY / footprint < 0.55) return;
    if (supportTop > bestTop) {
      bestTop = supportTop;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/**
 * Returns the nearest lower pallet in the same vertical stack. Floor pallets return -1.
 * The vertical gap may contain the lower pallet's cargo, so only footprint alignment and z-order are used.
 */
export function supportingIndexForSupport(supportIndex: number, supports: PhysicsSupport[]) {
  const support = supports[supportIndex];
  if (!support || support.z <= 0.01) return -1;
  let bestIndex = -1;
  let bestZ = -Infinity;
  supports.forEach((candidate, index) => {
    if (index === supportIndex || candidate.z >= support.z - EPS) return;
    if (overlapRatio(support, candidate) < 0.8) return;
    if (candidate.z > bestZ) {
      bestZ = candidate.z;
      bestIndex = index;
    }
  });
  return bestIndex;
}
