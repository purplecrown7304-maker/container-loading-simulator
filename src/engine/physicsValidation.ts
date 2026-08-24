import type { ContainerSpec, Placement } from './types';

const EPS = 1e-6;
const WALL_THICKNESS = 0.04;
const INITIAL_LIFT_M = 0.002;
const DEFAULT_FRICTION = 0.62;
const DEFAULT_RESTITUTION = 0.01;

export type PhysicsSeverity = 'stable' | 'warning' | 'unstable';

export type PhysicsPlacementResult = {
  index: number;
  cargoId: string;
  severity: PhysicsSeverity;
  horizontalShiftM: number;
  verticalShiftM: number;
  tiltDeg: number;
  linearSpeedMps: number;
  angularSpeedRadps: number;
  outOfBounds: boolean;
  reason: string;
};

export type PhysicsValidationResult = {
  engine: 'Rapier 3D';
  simulatedSeconds: number;
  steps: number;
  simulatedCount: number;
  stableCount: number;
  warningCount: number;
  unstableCount: number;
  score: number;
  settled: boolean;
  maxHorizontalShiftM: number;
  maxVerticalShiftM: number;
  maxTiltDeg: number;
  maxLinearSpeedMps: number;
  maxAngularSpeedRadps: number;
  placements: PhysicsPlacementResult[];
  summary: string;
};

let rapierPromise: ReturnType<typeof loadRapier> | null = null;

async function loadRapier() {
  const module = await import('@dimforge/rapier3d-compat');
  const RAPIER = module.default;
  await RAPIER.init();
  return RAPIER;
}

function getRapier() {
  rapierPromise ??= loadRapier();
  return rapierPromise;
}

function magnitude(v: { x: number; y: number; z: number }) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tiltFromQuaternion(q: { x: number; y: number; z: number; w: number }) {
  // Rotated local-up vector's Y component. Yaw alone therefore does not count as tilt.
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return Math.acos(clamp(upY, -1, 1)) * 180 / Math.PI;
}

function toPhysicsCenter(container: ContainerSpec, placement: Placement) {
  return {
    x: placement.x + placement.length / 2 - container.length / 2,
    y: placement.z + placement.height / 2 + INITIAL_LIFT_M,
    z: placement.y + placement.width / 2 - container.width / 2,
  };
}

function isCenterOutOfBounds(
  container: ContainerSpec,
  placement: Placement,
  center: { x: number; y: number; z: number },
) {
  const halfL = placement.length / 2;
  const halfH = placement.height / 2;
  const halfW = placement.width / 2;
  return (
    center.x - halfL < -container.length / 2 - 0.01 ||
    center.x + halfL > container.length / 2 + 0.01 ||
    center.z - halfW < -container.width / 2 - 0.01 ||
    center.z + halfW > container.width / 2 + 0.01 ||
    center.y - halfH < -0.01 ||
    center.y + halfH > container.height + 0.01
  );
}

function describeResult(input: Omit<PhysicsPlacementResult, 'reason' | 'severity'>): Pick<PhysicsPlacementResult, 'severity' | 'reason'> {
  const reasons: string[] = [];
  if (input.outOfBounds) reasons.push('컨테이너 경계 이탈');
  if (input.horizontalShiftM > 0.03) reasons.push(`수평 이동 ${(input.horizontalShiftM * 1000).toFixed(0)}mm`);
  if (Math.abs(input.verticalShiftM) > 0.03) reasons.push(`높이 변화 ${(input.verticalShiftM * 1000).toFixed(0)}mm`);
  if (input.tiltDeg > 3) reasons.push(`기울기 ${input.tiltDeg.toFixed(1)}°`);
  if (input.linearSpeedMps > 0.05 || input.angularSpeedRadps > 0.08) reasons.push('시뮬레이션 종료 시에도 움직임');

  const unstable = input.outOfBounds || input.horizontalShiftM > 0.03 || Math.abs(input.verticalShiftM) > 0.04 || input.tiltDeg > 4.5;
  if (unstable) return { severity: 'unstable', reason: reasons.join(' · ') || '물리적 불안정 감지' };

  const warning = input.horizontalShiftM > 0.012 || Math.abs(input.verticalShiftM) > 0.015 || input.tiltDeg > 1.8 || input.linearSpeedMps > 0.025 || input.angularSpeedRadps > 0.04;
  if (warning) return { severity: 'warning', reason: reasons.join(' · ') || '미세 이동/기울기 재확인 필요' };

  return { severity: 'stable', reason: '중력·충돌·마찰 시뮬레이션에서 안정' };
}

function chooseStepCount(count: number) {
  if (count >= 700) return 150;
  if (count >= 400) return 180;
  if (count >= 200) return 210;
  return 240;
}

/**
 * 현재 적재 좌표를 Rapier 강체 월드에 그대로 복제한 뒤 중력으로 안정화한다.
 * 이 함수는 적재 좌표를 바꾸지 않고 "현재 계획이 놓았을 때 유지되는가"만 검증한다.
 */
export async function runPhysicsValidation(
  container: ContainerSpec,
  placements: Placement[],
  onProgress?: (progress: number) => void,
): Promise<PhysicsValidationResult> {
  if (!placements.length) {
    return {
      engine: 'Rapier 3D', simulatedSeconds: 0, steps: 0, simulatedCount: 0,
      stableCount: 0, warningCount: 0, unstableCount: 0, score: 100, settled: true,
      maxHorizontalShiftM: 0, maxVerticalShiftM: 0, maxTiltDeg: 0,
      maxLinearSpeedMps: 0, maxAngularSpeedRadps: 0, placements: [],
      summary: '적재된 화물이 없어 물리 검증할 대상이 없습니다.',
    };
  }

  const RAPIER = await getRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const steps = chooseStepCount(placements.length);
  const simulatedSeconds = steps / 60;

  const fixed = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(DEFAULT_FRICTION)
        .setRestitution(DEFAULT_RESTITUTION),
    );
  };

  const halfL = container.length / 2;
  const halfW = container.width / 2;
  const wall = WALL_THICKNESS;
  fixed(halfL + wall, wall, halfW + wall, 0, -wall, 0); // floor
  fixed(halfL + wall, wall, halfW + wall, 0, container.height + wall, 0); // ceiling
  fixed(wall, container.height / 2, halfW + wall, -halfL - wall, container.height / 2, 0); // back
  fixed(wall, container.height / 2, halfW + wall, halfL + wall, container.height / 2, 0); // door plane
  fixed(halfL + wall, container.height / 2, wall, 0, container.height / 2, -halfW - wall); // left
  fixed(halfL + wall, container.height / 2, wall, 0, container.height / 2, halfW + wall); // right

  const bodies = placements.map((placement) => {
    const center = toPhysicsCenter(container, placement);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setCanSleep(true)
        .setCcdEnabled(false),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(EPS, placement.length / 2 - 0.0005),
        Math.max(EPS, placement.height / 2 - 0.0005),
        Math.max(EPS, placement.width / 2 - 0.0005),
      )
        .setMass(Math.max(0.01, placement.weightKg))
        .setFriction(DEFAULT_FRICTION)
        .setRestitution(DEFAULT_RESTITUTION),
      body,
    );
    return { body, center };
  });

  try {
    onProgress?.(0);
    for (let step = 0; step < steps; step += 1) {
      world.step();
      if (step % 24 === 23) {
        onProgress?.((step + 1) / steps);
        // Yield periodically so a large validation does not freeze the dashboard UI.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    onProgress?.(1);

    const placementResults = bodies.map(({ body, center }, index): PhysicsPlacementResult => {
      const placement = placements[index];
      const position = body.translation();
      const rotation = body.rotation();
      const linvel = body.linvel();
      const angvel = body.angvel();
      const horizontalShiftM = Math.hypot(position.x - center.x, position.z - center.z);
      const verticalShiftM = position.y - center.y;
      const tiltDeg = tiltFromQuaternion(rotation);
      const linearSpeedMps = magnitude(linvel);
      const angularSpeedRadps = magnitude(angvel);
      const outOfBounds = isCenterOutOfBounds(container, placement, position);
      const base = { index, cargoId: placement.cargoId, horizontalShiftM, verticalShiftM, tiltDeg, linearSpeedMps, angularSpeedRadps, outOfBounds };
      return { ...base, ...describeResult(base) };
    });

    const stableCount = placementResults.filter(x => x.severity === 'stable').length;
    const warningCount = placementResults.filter(x => x.severity === 'warning').length;
    const unstableCount = placementResults.filter(x => x.severity === 'unstable').length;
    const maxHorizontalShiftM = Math.max(0, ...placementResults.map(x => x.horizontalShiftM));
    const maxVerticalShiftM = Math.max(0, ...placementResults.map(x => Math.abs(x.verticalShiftM)));
    const maxTiltDeg = Math.max(0, ...placementResults.map(x => x.tiltDeg));
    const maxLinearSpeedMps = Math.max(0, ...placementResults.map(x => x.linearSpeedMps));
    const maxAngularSpeedRadps = Math.max(0, ...placementResults.map(x => x.angularSpeedRadps));
    const settled = maxLinearSpeedMps <= 0.05 && maxAngularSpeedRadps <= 0.08;
    const weightedPenalty = unstableCount * 1 + warningCount * 0.35;
    const score = Math.round(clamp(100 - weightedPenalty / Math.max(1, placements.length) * 100, 0, 100));

    const summary = unstableCount
      ? `불안정 ${unstableCount}개 · 주의 ${warningCount}개가 감지되었습니다. 붕괴/이동 가능 위치를 재배치해야 합니다.`
      : warningCount
        ? `붕괴 수준의 이동은 없지만 ${warningCount}개 위치에서 미세 이동 또는 기울기를 확인해야 합니다.`
        : '전체 적재물이 중력·충돌·마찰 조건에서 안정적으로 유지되었습니다.';

    return {
      engine: 'Rapier 3D', simulatedSeconds, steps, simulatedCount: placements.length,
      stableCount, warningCount, unstableCount, score, settled,
      maxHorizontalShiftM, maxVerticalShiftM, maxTiltDeg,
      maxLinearSpeedMps, maxAngularSpeedRadps,
      placements: placementResults,
      summary,
    };
  } finally {
    world.free();
  }
}
