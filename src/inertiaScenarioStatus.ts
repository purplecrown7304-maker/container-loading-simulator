import { isInertiaStable, type InertiaCertification, type InertiaScenario } from './inertiaCertification';

export const INERTIA_SCENARIOS: InertiaScenario[] = ['acceleration', 'braking', 'cornering'];

export type InertiaScenarioStatus = {
  tested: InertiaScenario[];
  passed: InertiaScenario[];
  failed: InertiaScenario[];
  pending: InertiaScenario[];
};

/**
 * 인증 객체의 results를 유일한 사실 원천으로 사용한다.
 * 과거 데이터의 failedScenarios에는 조기 중단으로 실행되지 않은 시나리오가
 * 실패로 기록될 수 있으므로 화면/보고서/내보내기는 이 정규화 결과를 사용한다.
 */
export function classifyInertiaScenarios(certification: InertiaCertification): InertiaScenarioStatus {
  const tested = INERTIA_SCENARIOS.filter((scenario) => Boolean(certification.results[scenario]));
  const passed = tested.filter((scenario) => {
    const result = certification.results[scenario];
    return Boolean(result && isInertiaStable(result, certification.mode));
  });
  const failed = tested.filter((scenario) => {
    const result = certification.results[scenario];
    return Boolean(result && !isInertiaStable(result, certification.mode));
  });
  const pending = INERTIA_SCENARIOS.filter((scenario) => !certification.results[scenario]);
  return { tested, passed, failed, pending };
}

export function normalizedInertiaCounts(certification: InertiaCertification) {
  const status = classifyInertiaScenarios(certification);
  return {
    testedScenarios: status.tested.length,
    passedScenarios: status.passed.length,
    failedScenarios: status.failed,
    pendingScenarios: status.pending,
  };
}
