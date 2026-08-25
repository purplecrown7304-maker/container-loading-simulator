import type { PhysicsScenario, PhysicsSupport } from './physicsValidation';
import { horizontalRestraintForce, supportingIndexForPlacement, supportingIndexForSupport, type RestraintModel } from './restraintPhysics';
import type { ContainerSpec, Placement } from './types';

const EPS = 1e-6;
const WALL_THICKNESS = 0.04;
const INITIAL_LIFT_M = 0.002;
const DEFAULT_FRICTION = 0.62;
const DEFAULT_RESTITUTION = 0.01;
const START_ACCELERATION_G = 0.30;
const BRAKING_G = 0.50;
const CORNERING_G = 0.35;
const RECORD_EVERY_STEPS = 2;
const SIMULATION_HZ = 60;

export type InertiaPhase = 'settle' | 'force' | 'coast';

export type InertiaSecuringProfile = {
  frictionCoefficient?: number;
  cargoRetentionRatio?: number;
  supportRetentionRatio?: number;
  cargoRestraint?: RestraintModel;
  /** Container-level blocking/load-bar restraint; stacked upper pallets rely on friction/contact. */
  supportRestraint?: RestraintModel;
};

export type InertiaAnimationFrame = {
  cargo: Float32Array;
  supports: Float32Array;
  phase: InertiaPhase;
  step: number;
};

export type InertiaAnimationResult = {
  scenario: PhysicsScenario;
  fps: number;
  simulatedSeconds: number;
  cargoCount: number;
  supportCount: number;
  frames: InertiaAnimationFrame[];
  maxHorizontalShiftM: number;
  maxTiltDeg: number;
  maxCargoRelativeSlipM?: number;
  /** Floor pallets relative to container; upper pallets relative to the pallet directly below. */
  maxSupportShiftM?: number;
  maxCargoRestraintForceN?: number;
  maxSupportRestraintForceN?: number;
};

let rapierPromise: ReturnType<typeof loadRapier> | null = null;

async function loadRapier() {
  const module = await import('@dimforge/rapier3d-deterministic-compat');
  const RAPIER = module.default;
  await RAPIER.init();
  return RAPIER;
}

function getRapier() {
  rapierPromise ??= loadRapier();
  return rapierPromise;
}

function chooseStepCount(count: number) {
  if (count >= 700) return 150;
  if (count >= 400) return 180;
  if (count >= 200) return 210;
  return 240;
}

function phaseForStep(step: number, totalSteps: number): InertiaPhase {
  const settleEnd = Math.floor(totalSteps * 0.45);
  const forceEnd = Math.floor(totalSteps * 0.78);
  if (step < settleEnd) return 'settle';
  if (step < forceEnd) return 'force';
  return 'coast';
}

function accelerationForScenario(scenario: PhysicsScenario, step: number, totalSteps: number) {
  if (phaseForStep(step, totalSteps) !== 'force') return { x: 0, z: 0 };
  if (scenario === 'acceleration') return { x: -9.81 * START_ACCELERATION_G, z: 0 };
  if (scenario === 'braking') return { x: 9.81 * BRAKING_G, z: 0 };
  if (scenario === 'cornering') return { x: 0, z: 9.81 * CORNERING_G };
  return { x: 0, z: 0 };
}

function restraintFromRatio(ratio: number, role: 'cargo' | 'support'): RestraintModel | undefined {
  if (ratio <= 0) return undefined;
  if (role === 'cargo') {
    return {
      springAccelerationPerM: 6 + ratio * 24,
      dampingPerSecond: 2 + ratio * 6,
      maxAccelerationG: 0.08 + ratio * 0.62,
    };
  }
  return {
    springAccelerationPerM: 4 + ratio * 18,
    dampingPerSecond: 2 + ratio * 5,
    maxAccelerationG: 0.06 + ratio * 0.70,
  };
}

function toPhysicsCenter(
  container: ContainerSpec,
  item: Pick<Placement, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
) {
  return {
    x: item.x + item.length / 2 - container.length / 2,
    y: item.z + item.height / 2 + INITIAL_LIFT_M,
    z: item.y + item.width / 2 - container.width / 2,
  };
}

function tiltFromQuaternion(q: { x: number; y: number; z: number; w: number }) {
  const upY = Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z)));
  return Math.acos(upY) * 180 / Math.PI;
}

function packTransforms(entries: Array<{ body: { translation: () => { x: number; y: number; z: number }; rotation: () => { x: number; y: number; z: number; w: number } } }>) {
  const packed = new Float32Array(entries.length * 7);
  entries.forEach((entry, index) => {
    const p = entry.body.translation();
    const q = entry.body.rotation();
    const offset = index * 7;
    packed[offset] = p.x;
    packed[offset + 1] = p.y;
    packed[offset + 2] = p.z;
    packed[offset + 3] = q.x;
    packed[offset + 4] = q.y;
    packed[offset + 5] = q.z;
    packed[offset + 6] = q.w;
  });
  return packed;
}

export async function runInertiaAnimation(
  container: ContainerSpec,
  placements: Placement[],
  scenario: PhysicsScenario,
  supports: PhysicsSupport[] = [],
  onProgress?: (value: number) => void,
  securing?: InertiaSecuringProfile,
): Promise<InertiaAnimationResult> {
  const RAPIER = await getRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const totalSteps = chooseStepCount(placements.length + supports.length);
  const frames: InertiaAnimationFrame[] = [];
  const friction = Math.max(0.05, Math.min(2, securing?.frictionCoefficient ?? DEFAULT_FRICTION));
  const cargoRetentionRatio = Math.max(0, Math.min(0.95, securing?.cargoRetentionRatio ?? 0));
  const supportRetentionRatio = Math.max(0, Math.min(0.95, securing?.supportRetentionRatio ?? 0));
  const cargoRestraint = securing?.cargoRestraint ?? restraintFromRatio(cargoRetentionRatio, 'cargo');
  const supportRestraint = securing?.supportRestraint ?? restraintFromRatio(supportRetentionRatio, 'support');

  const fixed = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(friction)
        .setRestitution(DEFAULT_RESTITUTION),
    );
  };

  const halfL = container.length / 2;
  const halfW = container.width / 2;
  const wall = WALL_THICKNESS;
  fixed(halfL + wall, wall, halfW + wall, 0, -wall, 0);
  fixed(halfL + wall, wall, halfW + wall, 0, container.height + wall, 0);
  fixed(wall, container.height / 2, halfW + wall, -halfL - wall, container.height / 2, 0);
  fixed(wall, container.height / 2, halfW + wall, halfL + wall, container.height / 2, 0);
  fixed(halfL + wall, container.height / 2, wall, 0, container.height / 2, -halfW - wall);
  fixed(halfL + wall, container.height / 2, wall, 0, container.height / 2, halfW + wall);

  const createBody = (
    item: Pick<Placement, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
    weightKg: number,
    dynamic: boolean,
    retentionRatio: number,
  ) => {
    const center = toPhysicsCenter(container, item);
    const desc = dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    const body = world.createRigidBody(desc.setTranslation(center.x, center.y, center.z).setCanSleep(true).setCcdEnabled(false));
    const collider = RAPIER.ColliderDesc.cuboid(
      Math.max(EPS, item.length / 2 - 0.0005),
      Math.max(EPS, item.height / 2 - 0.0005),
      Math.max(EPS, item.width / 2 - 0.0005),
    ).setFriction(friction).setRestitution(DEFAULT_RESTITUTION);
    if (dynamic) collider.setMass(Math.max(0.01, weightKg));
    world.createCollider(collider, body);
    return { body, center, massKg: Math.max(0.01, weightKg), dynamic, retentionRatio };
  };

  const supportBodies = supports.map((item, index) => ({
    ...createBody(item, item.weightKg, item.dynamic !== false, supportRetentionRatio),
    parentSupportIndex: supportingIndexForSupport(index, supports),
  }));
  const cargoBodies = placements.map(item => ({
    ...createBody(item, item.weightKg, true, cargoRetentionRatio),
    supportIndex: supportingIndexForPlacement(item, supports),
  }));
  const dynamicBodies = [...cargoBodies, ...supportBodies].filter(entry => entry.dynamic);
  const cargoAnchorOffsets = cargoBodies.map(entry => {
    const support = entry.supportIndex >= 0 ? supportBodies[entry.supportIndex] : undefined;
    return support ? { x: entry.center.x - support.center.x, z: entry.center.z - support.center.z } : { x: 0, z: 0 };
  });
  const supportAnchorOffsets = supportBodies.map(entry => {
    const parent = entry.parentSupportIndex >= 0 ? supportBodies[entry.parentSupportIndex] : undefined;
    return parent ? { x: entry.center.x - parent.center.x, z: entry.center.z - parent.center.z } : { x: 0, z: 0 };
  });

  let maxHorizontalShiftM = 0;
  let maxTiltDeg = 0;
  let maxCargoRelativeSlipM = 0;
  let maxSupportShiftM = 0;
  let maxCargoRestraintForceN = 0;
  let maxSupportRestraintForceN = 0;

  const record = (step: number) => {
    supportBodies.forEach((entry, index) => {
      const p = entry.body.translation();
      const parent = entry.parentSupportIndex >= 0 ? supportBodies[entry.parentSupportIndex] : undefined;
      const parentPosition = parent?.body.translation();
      const offset = supportAnchorOffsets[index];
      const target = parentPosition
        ? { x: parentPosition.x + offset.x, z: parentPosition.z + offset.z }
        : { x: entry.center.x, z: entry.center.z };
      maxSupportShiftM = Math.max(maxSupportShiftM, Math.hypot(p.x - target.x, p.z - target.z));
    });
    cargoBodies.forEach((entry, index) => {
      const p = entry.body.translation();
      const q = entry.body.rotation();
      maxHorizontalShiftM = Math.max(maxHorizontalShiftM, Math.hypot(p.x - entry.center.x, p.z - entry.center.z));
      maxTiltDeg = Math.max(maxTiltDeg, tiltFromQuaternion(q));
      const support = entry.supportIndex >= 0 ? supportBodies[entry.supportIndex] : undefined;
      const supportPosition = support?.body.translation();
      const offset = cargoAnchorOffsets[index];
      const target = supportPosition
        ? { x: supportPosition.x + offset.x, z: supportPosition.z + offset.z }
        : { x: entry.center.x, z: entry.center.z };
      maxCargoRelativeSlipM = Math.max(maxCargoRelativeSlipM, Math.hypot(p.x - target.x, p.z - target.z));
    });
    frames.push({ cargo: packTransforms(cargoBodies), supports: packTransforms(supportBodies), phase: phaseForStep(step, totalSteps), step });
  };

  try {
    onProgress?.(0);
    record(0);
    for (let step = 0; step < totalSteps; step += 1) {
      const accel = accelerationForScenario(scenario, step, totalSteps);
      dynamicBodies.forEach(entry => {
        entry.body.resetForces(false);
        if (accel.x || accel.z) {
          const hasCargoMarker = 'supportIndex' in entry;
          const usingPhysicalRestraint = hasCargoMarker ? Boolean(cargoRestraint) : Boolean(supportRestraint);
          const transmittedRatio = usingPhysicalRestraint ? 1 : 1 - entry.retentionRatio;
          entry.body.addForce({ x: accel.x * entry.massKg * transmittedRatio, y: 0, z: accel.z * entry.massKg * transmittedRatio }, true);
        }
      });

      if (supportRestraint) {
        supportBodies.forEach(entry => {
          if (!entry.dynamic || entry.parentSupportIndex >= 0) return;
          const p = entry.body.translation();
          const v = entry.body.linvel();
          const force = horizontalRestraintForce(
            entry.massKg,
            { x: p.x, z: p.z },
            { x: entry.center.x, z: entry.center.z },
            { x: v.x, z: v.z },
            { x: 0, z: 0 },
            supportRestraint,
          );
          maxSupportRestraintForceN = Math.max(maxSupportRestraintForceN, force.magnitudeN);
          entry.body.addForce({ x: force.x, y: 0, z: force.z }, true);
        });
      }

      if (cargoRestraint) {
        cargoBodies.forEach((entry, index) => {
          const p = entry.body.translation();
          const v = entry.body.linvel();
          const support = entry.supportIndex >= 0 ? supportBodies[entry.supportIndex] : undefined;
          const offset = cargoAnchorOffsets[index];
          const supportPosition = support?.body.translation();
          const supportVelocity = support?.body.linvel();
          const target = supportPosition
            ? { x: supportPosition.x + offset.x, z: supportPosition.z + offset.z }
            : { x: entry.center.x, z: entry.center.z };
          const targetVelocity = supportVelocity ? { x: supportVelocity.x, z: supportVelocity.z } : { x: 0, z: 0 };
          const force = horizontalRestraintForce(
            entry.massKg,
            { x: p.x, z: p.z },
            target,
            { x: v.x, z: v.z },
            targetVelocity,
            cargoRestraint,
          );
          maxCargoRestraintForceN = Math.max(maxCargoRestraintForceN, force.magnitudeN);
          entry.body.addForce({ x: force.x, y: 0, z: force.z }, true);
        });
      }

      world.step();
      if ((step + 1) % RECORD_EVERY_STEPS === 0 || step === totalSteps - 1) record(step + 1);
      if (step % 24 === 23) {
        onProgress?.((step + 1) / totalSteps);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    onProgress?.(1);
    return {
      scenario,
      fps: SIMULATION_HZ / RECORD_EVERY_STEPS,
      simulatedSeconds: totalSteps / SIMULATION_HZ,
      cargoCount: placements.length,
      supportCount: supports.length,
      frames,
      maxHorizontalShiftM,
      maxTiltDeg,
      maxCargoRelativeSlipM,
      maxSupportShiftM,
      maxCargoRestraintForceN,
      maxSupportRestraintForceN,
    };
  } finally {
    world.free();
  }
}
