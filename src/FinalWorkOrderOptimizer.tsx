import { useEffect, useState } from 'react';
import { REQUEST_FINAL_WORK_ORDER_EVENT, type FinalWorkOrderRequest } from './finalWorkOrderEvents';
import { restorePalletPhysicsTarget } from './palletTargetRestore';
import { openPalletLoadingReport } from './palletWorkerReportV2';
import { publishLoadSimAcceptance } from './rule-engine/acceptance';

export default function FinalWorkOrderOptimizer() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<FinalWorkOrderRequest>).detail;
      if (!detail) return;
      const target = restorePalletPhysicsTarget(detail.container, detail.cargo);
      if (!target) { setError('현재 팔레트 적재 결과가 없습니다.'); return; }
      const acceptance = publishLoadSimAcceptance(target);
      if (acceptance.status !== 'accepted') { setError(acceptance.validationIssues.map(issue => issue.message).join(' · ') || 'A 팔레트 적재 규칙 최종 검사 실패'); return; }
      setError(openPalletLoadingReport(target.container, target.cargo) ? '' : '팝업을 허용한 뒤 작업지시서를 다시 여세요.');
    };
    window.addEventListener(REQUEST_FINAL_WORK_ORDER_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_FINAL_WORK_ORDER_EVENT, onRequest);
  }, []);
  if (!error) return null;
  return <div className="final-cert-backdrop"><section className="final-cert-modal" role="dialog" aria-modal="true"><header><h2>A 팔레트 작업지시서</h2><button type="button" onClick={() => setError('')}>닫기</button></header><p>{error}</p><p>물리·관성 검사는 별도 선택 검사입니다.</p></section></div>;
}
