import { useEffect, useState } from 'react';
import { REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, openResultsModal, type ResultsModalDetail } from './resultsModalEvents';
import { restorePalletPhysicsTarget } from './palletTargetRestore';
import { publishLoadSimAcceptance } from './rule-engine/acceptance';

export default function PalletResultsOptimizer() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ResultsModalDetail>).detail;
      if (!detail) return;
      const target = restorePalletPhysicsTarget(detail.container, detail.cargo);
      if (!target) { setError('현재 팔레트 적재 결과가 없습니다.'); return; }
      const acceptance = publishLoadSimAcceptance(target);
      if (acceptance.status !== 'accepted') { setError(acceptance.validationIssues.map(issue => issue.message).join(' · ') || 'A 팔레트 적재 규칙 최종 검사 실패'); return; }
      setError('');
      openResultsModal({ container: target.container, cargo: target.cargo, result: target.result, staticAcceptance: acceptance });
    };
    window.addEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
  }, []);
  if (!error) return null;
  return <div className="final-cert-backdrop"><section className="final-cert-modal" role="dialog" aria-modal="true"><header><h2>A 팔레트 적재 규칙 검사</h2><button type="button" onClick={() => setError('')}>닫기</button></header><p>{error}</p><p>물리·관성 검사는 별도 선택 검사입니다.</p></section></div>;
}
