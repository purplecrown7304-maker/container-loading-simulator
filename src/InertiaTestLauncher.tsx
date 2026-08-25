import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';

export default function InertiaTestLauncher() {
  return <button
    type="button"
    className="inertia-launcher"
    onClick={() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT))}
    aria-label="관성 애니메이션 테스트 열기"
  >
    <b>관성 테스트</b>
    <span>출발 · 급정거 · 급회전</span>
  </button>;
}
