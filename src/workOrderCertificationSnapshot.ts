import {
  buildSecuringUsage,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

function certificationMatchesCurrentTarget(target: PhysicsTarget, certification: InertiaCertification | undefined) {
  return Boolean(certification
    && certification.mode === target.mode
    && certification.targetSignature === createPhysicsTargetSignature(target));
}

/**
 * 작업지시서는 관성 PASS 여부와 무관하게 현재 적재안 기준으로 항상 만들 수 있어야 한다.
 * 현재 적재안과 일치하는 인증 결과가 있으면 PASS/주의/위험 상태를 그대로 사용하고,
 * 없으면 0/3 검사 상태의 임시 인증을 만들어 문서에 '검사 미완료'를 명시한다.
 */
export function workOrderCertificationForTarget(target: PhysicsTarget): InertiaCertification {
  const latest = readLatestInertiaCertification();
  if (certificationMatchesCurrentTarget(target, latest)) return latest!;

  const securing = buildSecuringUsage(target, 1);
  return {
    status: 'failed',
    mode: target.mode,
    targetSignature: createPhysicsTargetSignature(target),
    testedAt: new Date().toISOString(),
    securing,
    testedScenarios: 0,
    passedScenarios: 0,
    failedScenarios: [],
    maxHorizontalShiftM: 0,
    maxTiltDeg: 0,
    maxCargoRelativeSlipM: 0,
    maxSupportShiftM: 0,
    maxCargoRestraintForceN: 0,
    maxSupportRestraintForceN: 0,
    results: {},
    payloadWithinLimit: target.result.loadedWeightKg + securing.estimatedAddedWeightKg <= target.container.maxPayloadKg + 1e-9,
    attempts: [],
  };
}
