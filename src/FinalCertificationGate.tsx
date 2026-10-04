import { useEffect, useState } from 'react';
import { REQUEST_CERTIFIED_RESULTS_EVENT, type CertificationRequestDetail } from './inertiaCertification';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { createLoadSimTargetSignature, publishLoadSimAcceptance } from './rule-engine/acceptance';

/** Compatibility event endpoint; loading acceptance belongs exclusively to A. */
export default function FinalCertificationGate() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<CertificationRequestDetail>).detail;
      if (!detail) return;
      const current = readPhysicsTarget();
      const target: PhysicsTarget = { mode: detail.result.ruleEngineInput ? 'pallets' : 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result, supports: current?.supports };
      if (current && createLoadSimTargetSignature(current) !== createLoadSimTargetSignature(target)) { setError('현재 적재안과 요청한 결과가 다릅니다. 최신 결과에서 다시 여세요.'); return; }
      const acceptance = publishLoadSimAcceptance(target);
      if (acceptance.status !== 'accepted') {
        setError(acceptance.validationIssues.map(issue => issue.message).join(' · ') || 'A 적재 규칙 최종 검사 실패');
        return;
      }
      setError('');
      if (!detail.automatic) openResultsModal({ container: target.container, cargo: target.cargo, result: target.result, staticAcceptance: acceptance });
    };
    window.addEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
  }, []);
  if (!error) return null;
  return <div className="final-cert-backdrop"><section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="final-cert-title">
    <header><div><span>A STATIC LOADING RULES</span><h2 id="final-cert-title">A 적재 규칙 최종 검사</h2><p>물리·관성 검사는 별도 선택 검사입니다.</p></div><button type="button" onClick={() => setError('')}>닫기</button></header>
    <div className="final-cert-error"><b>적재 규칙 오류</b><span>{error}</span></div>
  </section></div>;
}
