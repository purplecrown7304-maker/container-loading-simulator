import type { PhysicsScenario, PhysicsSupport } from './physicsValidation';
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
  /** 접촉면 마찰계수. 미끄럼방지재/포장 보강을 단순화해 반영한다. */
  frictionCoefficient?: number;
  /** 밴딩·랩핑·각대 등으로 화물 관성력이 적재면에 전달되는 비율(0~0.95). */
  cargoRetentionRatio?: number;
  /** 팔레트 미끄럼방지/고정으로 팔레트 관성력이 바닥에 전달되는 비율(0~0.95). */
  supportRetentionRatio?: number;
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

/**
 * Rapier 월드의 실제 강체 위치/회전을 프레임으로 기록한다.
 * UI는 이 결과를 재생만 하므로 검증 엔진과 동일한 충돌/마찰/중력 동작을 눈으로 확인할 수 있다.
 * securing은 밴딩·각대·랩핑·미끄럼방지재의 구속 효과를 비교용 계수로 반영한다.
 */
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
    const body = world.createRigidBody(
      desc.setTranslation(center.x, center.y, center.z).setCanSleep(true).setCcdEnabled(false),
    );
    const collider = RAPIER.ColliderDesc.cuboid(
      Math.max(EPS, item.length / 2 - 0.0005),
      Math.max(EPS, item.height / 2 - 0.0005),
      Math.max(EPS, item.width / 2 - 0.0005),
    ).setFriction(friction).setRestitution(DEFAULT_RESTITUTION);
    if (dynamic) collider.setMass(Math.max(0.01, weightKg));
    world.createCollider(collider, body);
    return { body, center, massKg: Math.max(0.01, weightKg), dynamic, retentionRatio };
  };

  const cargoBodies = placements.map(item => createBody(item, item.weightKg, true, cargoRetentionRatio));
  const supportBodies = supports.map(item => createBody(item, item.weightKg, item.dynamic !== false, supportRetentionRatio));
  const dynamicBodies = [...cargoBodies, ...supportBodies].filter(entry => entry.dynamic);
  let maxHorizontalShiftM = 0;
  let maxTiltDeg = 0;

  const record = (step: number) => {
    cargoBodies.forEach(entry => {
      const p = entry.body.translation();
      const q = entry.body.rotation();
      maxHorizontalShiftM = Math.max(
        maxHorizontalShiftM,
        Math.hypot(p.x - entry.center.x, p.z - entry.center.z),
      );
      maxTiltDeg = Math.max(maxTiltDeg, tiltFromQuaternion(q));
    });
    frames.push({
      cargo: packTransforms(cargoBodies),
      supports: packTransforms(supportBodies),
      phase: phaseForStep(step, totalSteps),
      step,
    });
  };

  try {
    onProgress?.(0);
    record(0);
    for (let step = 0; step < totalSteps; step += 1) {
      const accel = accelerationForScenario(scenario, step, totalSteps);
      dynamicBodies.forEach(entry => {
        entry.body.resetForces(false);
        if (accel.x || accel.z) {
          const transmittedRatio = 1 - entry.retentionRatio;
          entry.body.addForce({
            x: accel.x * entry.massKg * transmittedRatio,
            y: 0,
            z: accel.z * entry.massKg * transmittedRatio,
          }, true);
        }
      });
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
    };
  } finally {
    world.free();
  }
}
