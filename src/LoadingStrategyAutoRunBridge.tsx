/**
 * 과거에는 STEP 5 진입 순간 자동으로 run-loading을 예약했다.
 * GuidedWorkflowShell의 '자동 적재 실행' 버튼도 같은 액션을 실행하므로 두 실행이 겹칠 수 있었고,
 * 첫 결과가 잠깐 보인 뒤 두 번째 실행이 결과를 pending 상태로 되돌리는 경쟁 조건이 생겼다.
 *
 * 자동 적재 실행의 소유자는 이제 GuidedWorkflowShell 하나뿐이다.
 * 이 호환 컴포넌트는 main.tsx 구조를 흔들지 않기 위해 남겨 두되 아무 실행도 예약하지 않는다.
 */
export default function LoadingStrategyAutoRunBridge() {
  return null;
}
