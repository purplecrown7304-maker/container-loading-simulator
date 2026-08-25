import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';

export default function InertiaTestLauncher() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));
  }, []);

  if (!host) return null;

  return createPortal(
    <section className="dashboard-card inertia-dashboard-card" aria-labelledby="inertia-dashboard-title">
      <div className="inertia-dashboard-head">
        <div>
          <h2 id="inertia-dashboard-title">7. 관성 테스트</h2>
          <span>출발 · 급정거 · 급회전에서 적재물이 실제로 버티는지 3D 모션으로 확인합니다.</span>
        </div>
      </div>
      <button
        type="button"
        className="inertia-dashboard-action"
        onClick={() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT))}
      >
        관성 애니메이션 테스트 열기
      </button>
      <div className="inertia-dashboard-scenarios">
        <span>출발 <b>0.30g</b></span>
        <span>급정거 <b>0.50g</b></span>
        <span>급회전 <b>0.35g</b></span>
      </div>
    </section>,
    host,
  );
}
