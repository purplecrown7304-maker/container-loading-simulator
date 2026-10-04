import { useEffect, useState } from 'react';
import { REQUEST_DIRECT_WORK_ORDER_EVENT, type DirectWorkOrderRequest } from './directWorkOrderEvents';
import { openLoadingReport } from './report';
import { createLoadSimTargetSignature, publishLoadSimAcceptance } from './rule-engine/acceptance';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

/** Work orders use the exact A-accepted layout, without inertia-driven repacking. */
export default function DirectWorkOrderOptimizer() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<DirectWorkOrderRequest>).detail;
      if (!detail) return;
      const target: PhysicsTarget = { mode: 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result };
      const current = readPhysicsTarget();
      if (current && createLoadSimTargetSignature(current) !== createLoadSimTargetSignature(target)) { setError('현재 적재안과 요청한 작업지시서가 다릅니다. 최신 결과에서 다시 여세요.'); return; }
      const acceptance = publishLoadSimAcceptance(target);
      if (acceptance.status !== 'accepted') {
        setError(acceptance.validationIssues.map(issue => issue.message).join(' · ') || 'A 적재 규칙 최종 검사 실패');
        return;
      }
      setError('');
      if (detail.openReport !== false && !openLoadingReport(detail.container, detail.cargo, detail.result)) setError('팝업을 허용한 뒤 작업지시서를 다시 여세요.');
    };
    window.addEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
  }, []);
  if (!error) return null;
  return <div className="final-cert-backdrop"><section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="direct-work-order-title">
    <header><div><span>A STATIC LOADING RULES</span><h2 id="direct-work-order-title">A 적재 작업지시서</h2><p>물리·관성 검사는 별도 선택 검사입니다.</p></div><button type="button" onClick={() => setError('')}>닫기</button></header>
    <div className="final-cert-error"><span>{error}</span></div>
  </section></div>;
}
