import { runInertiaAnimation, type InertiaAnimationResult } from './engine/inertiaSimulation';
import {
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  isInertiaStable,
  securingProfileForUsage,
  type CertificationProgress,
  type InertiaAttemptScenario,
  type InertiaCertification,
  type InertiaScenario,
  type SecuringLevel,
} from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

export const WORK_ORDER_DANGER_SHIFT_M = 0.03;
export const WORK_ORDER_DANGER_TILT_DEG = 4.5;
export const WORK_ORDER_DANGER_PALLET_CARGO_SLIP_M = 0.02;
export const WORK_ORDER_DANGER_SUPPORT_SHIFT_M = 0.03;

const SCENARIOS: InertiaScenario[] = ['acceleration', 'braking', 'cornering'];

export type WorkOrderSafetyLevel = 'pass' | 'caution' | 'danger' | 'incomplete';

export function isInertiaResultDangerous(
  result: InertiaAnimationResult,
  mode: PhysicsTarget['mode'] = 'boxes',
) {
  if (result.maxHorizontalShiftM > WORK_ORDER_DANGER_SHIFT_M) return true;
  if (result.maxTiltDeg > WORK_ORDER_DANGER_TILT_DEG) return true;
  if (mode === 'pallets') {
    if ((result.maxCargoRelativeSlipM ?? result.maxHorizontalShiftM) > WORK_ORDER_DANGER_PALLET_CARGO_SLIP_M) return true;
    if ((result.maxSupportShiftM ?? 0) > WORK_ORDER_DANGER_SUPPORT_SHIFT_M) return true;
  }
  return false;
}

export function assessWorkOrderCertification(certification: InertiaCertification): WorkOrderSafetyLevel {
  if (!certification.payloadWithinLimit) return 'danger';
  const tested = SCENARIOS.flatMap(scenario => certification.results[scenario] ? [certification.results[scenario]!] : []);
  if (tested.some(result => isInertiaResultDangerous(result, certification.mode))) return 'danger';
  if (tested.length !== SCENARIOS.length) return 'incomplete';
  return certification.status === 'passed' ? 'pass' : 'caution';
}

export function canCreateWorkOrder(certification: InertiaCertification) {
  const level = assessWorkOrderCertification(certification);
  return level === 'pass' || level === 'caution';
}

export function workOrderApprovalLabel(certification: InertiaCertification) {
  const level = assessWorkOrderCertification(certification);
  if (level === 'pass') return 'PASS';
  if (level === 'caution') return '주의 승인';
  if (level === 'danger') return '위험';
  return '검증 미완료';
}

function scenarioLabel(scenario: InertiaScenario) {
  if (scenario === 'acceleration') return '출발 가속';
  if (scenario === 'braking') return '급정거';
  return '급회전';
}

export function buildWorkOrderRecommendations(certification: InertiaCertification) {
  const items: string[] = [];
  const level = assessWorkOrderCertification(certification);

  if (level === 'caution') {
    items.push('내부 PASS 기준을 일부 초과했지만 위험 기준 이내입니다. 아래 보완사항을 적용하고 출고 전 현장 흔들림·간섭 상태를 재확인하세요.');
  } else if (level === 'pass') {
    items.push('관성 3종 내부 PASS 조건을 충족했습니다. 작업지시서에 표시된 보강자재 수량과 설치 위치를 그대로 적용하세요.');
  }

  if (certification.maxHorizontalShiftM > INERTIA_PASS_SHIFT_M) {
    items.push('수평 이동이 내부 PASS 기준보다 큽니다. 미끄럼방지재와 빈 공간 블로킹 상태를 강화하고 화물 사이 유격을 줄이세요.');
  }
  if (certification.maxTiltDeg > INERTIA_PASS_TILT_DEG) {
    items.push('기울기가 내부 PASS 기준보다 큽니다. 높은 적층을 낮추고 무거운 화물을 하부에 유지해 무게중심을 낮추세요.');
  }
  if (certification.mode === 'pallets' && (certification.maxCargoRelativeSlipM ?? 0) > INERTIA_PASS_PALLET_CARGO_SLIP_M) {
    items.push('화물-팔레트 상대 미끄럼이 내부 PASS 기준보다 큽니다. 밴딩·랩핑·미끄럼방지재가 화물과 팔레트를 함께 구속하는지 확인하세요.');
  }
  if (certification.mode === 'pallets' && (certification.maxSupportShiftM ?? 0) > INERTIA_PASS_SUPPORT_SHIFT_M) {
    items.push('팔레트 자체 이동이 내부 PASS 기준보다 큽니다. 바닥 접촉면과 고정바/블로킹 위치를 확인하고 팔레트 이동 여유를 줄이세요.');
  }

  for (const scenario of certification.failedScenarios) {
    if (scenario === 'acceleration') items.push(`${scenarioLabel(scenario)} 보완: 출발 시 뒤쪽으로 밀리지 않도록 후방 지지·블로킹 상태를 확인하세요.`);
    if (scenario === 'braking') items.push(`${scenarioLabel(scenario)} 보완: 급제동 시 앞쪽으로 밀리지 않도록 전방 지지와 문쪽 끝단의 유격을 확인하세요.`);
    if (scenario === 'cornering') items.push(`${scenarioLabel(scenario)} 보완: 좌우 측벽 유격과 좌우 중량 편차를 줄이고 상단 편중을 피하세요.`);
  }

  items.push('실제 출고 전 차량/컨테이너 제원, 포장재 강도, 결박장치 정격, 마찰 상태와 회사 현장 기준을 최종 확인하세요.');
  return [...new Set(items)];
}

function attemptScenarios(results: Partial<Record<InertiaScenario, InertiaAnimationResult>>, mode: PhysicsTarget['mode']) {
  return SCENARIOS.flatMap(scenario => {
    const result = results[scenario];
    return result ? [{
      scenario,
      passed: isInertiaStable(result, mode),
      maxHorizontalShiftM: result.maxHorizontalShiftM,
      maxTiltDeg: result.maxTiltDeg,
      maxCargoRelativeSlipM: result.maxCargoRelativeSlipM,
      maxSupportShiftM: result.maxSupportShiftM,
    } satisfies InertiaAttemptScenario] : [];
  });
}

/**
 * Normal certification stops a securing level as soon as strict PASS fails.
 * Work-order approval needs a different answer: whether all three scenarios are
 * below the DANGER limits. This fills only the missing scenarios at the final
 * securing level and keeps the stricter PASS/FAIL status unchanged.
 */
export async function completeCertificationForWorkOrder(
  target: PhysicsTarget,
  certification: InertiaCertification,
  onProgress?: (progress: CertificationProgress) => void,
  onScenarioResult?: (result: InertiaAnimationResult, level: SecuringLevel) => void,
  shouldCancel?: () => boolean,
): Promise<InertiaCertification> {
  if (!certification.payloadWithinLimit || certification.status === 'passed') return certification;
  if (assessWorkOrderCertification(certification) === 'danger') return certification;

  const level = certification.securing.level;
  const profile = securingProfileForUsage(target.mode, certification.securing);
  const results: Partial<Record<InertiaScenario, InertiaAnimationResult>> = { ...certification.results };

  for (let index = 0; index < SCENARIOS.length; index += 1) {
    if (shouldCancel?.()) throw new Error('INERTIA_WORK_ORDER_CANCELLED');
    const scenario = SCENARIOS[index];
    if (results[scenario]) continue;
    const result = await runInertiaAnimation(
      target.container,
      target.result.placements,
      scenario,
      target.supports ?? [],
      value => onProgress?.({
        level,
        levelLabel: certification.securing.levelLabel,
        scenario,
        scenarioIndex: index + 1,
        scenarioCount: SCENARIOS.length,
        physicsProgress: value,
      }),
      profile,
      { captureFrames: false, shouldCancel },
    );
    results[scenario] = result;
    onScenarioResult?.(result, level);
    if (isInertiaResultDangerous(result, target.mode)) break;
  }

  const values = SCENARIOS.flatMap(scenario => results[scenario] ? [results[scenario]!] : []);
  const failedScenarios = SCENARIOS.filter(scenario => {
    const result = results[scenario];
    return !result || !isInertiaStable(result, target.mode);
  });
  const strictPassed = certification.payloadWithinLimit
    && values.length === SCENARIOS.length
    && failedScenarios.length === 0;
  const scenarios = attemptScenarios(results, target.mode);
  const attempts = [...(certification.attempts ?? [])];
  const attemptIndex = attempts.map(attempt => attempt.level).lastIndexOf(level);
  if (attemptIndex >= 0) {
    attempts[attemptIndex] = {
      ...attempts[attemptIndex],
      passed: strictPassed,
      scenarios,
    };
  } else {
    attempts.push({
      level,
      levelLabel: certification.securing.levelLabel,
      payloadWithinLimit: certification.payloadWithinLimit,
      passed: strictPassed,
      scenarios,
    });
  }

  return {
    ...certification,
    status: strictPassed ? 'passed' : 'failed',
    testedAt: new Date().toISOString(),
    testedScenarios: values.length,
    passedScenarios: values.filter(result => isInertiaStable(result, target.mode)).length,
    failedScenarios,
    maxHorizontalShiftM: values.reduce((max, result) => Math.max(max, result.maxHorizontalShiftM), 0),
    maxTiltDeg: values.reduce((max, result) => Math.max(max, result.maxTiltDeg), 0),
    maxCargoRelativeSlipM: values.reduce((max, result) => Math.max(max, result.maxCargoRelativeSlipM ?? 0), 0),
    maxSupportShiftM: values.reduce((max, result) => Math.max(max, result.maxSupportShiftM ?? 0), 0),
    maxCargoRestraintForceN: values.reduce((max, result) => Math.max(max, result.maxCargoRestraintForceN ?? 0), 0),
    maxSupportRestraintForceN: values.reduce((max, result) => Math.max(max, result.maxSupportRestraintForceN ?? 0), 0),
    results,
    attempts,
  };
}
