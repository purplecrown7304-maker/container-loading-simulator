import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OPEN_RESULTS_MODAL_EVENT, type ResultsModalDetail } from './resultsModalEvents';

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
}

export default function CertificationResultSummaryBridge() {
  const [detail, setDetail] = useState<ResultsModalDetail | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<ResultsModalDetail>).detail;
      if (!next?.certification || next.certification.status !== 'passed') return;
      setDetail(next);
      requestAnimationFrame(() => {
        const summary = document.querySelector('.results-summary-grid');
        if (!summary?.parentElement) return;
        let target = document.querySelector<HTMLElement>('.certification-result-host');
        if (!target) {
          target = document.createElement('div');
          target.className = 'certification-result-host';
          summary.insertAdjacentElement('afterend', target);
        }
        setHost(target);
      });
    };
    window.addEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.results-modal') && host) {
        setHost(null);
        setDetail(null);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host]);

  if (!detail?.certification || !host) return null;
  const cert = detail.certification;
  const usage = cert.securing;

  return createPortal(<article className="certification-result-card">
    <div className="certification-result-head">
      <div><span>FINAL INERTIA CERTIFIED</span><b>관성 검증 3종 통과 · 최종 적재안</b><small>{usage.levelLabel}</small></div>
      <strong>PASS</strong>
    </div>
    <div className="certification-result-kpi">
      <div><span>최대 이동</span><b>{mm(cert.maxHorizontalShiftM)}</b></div>
      <div><span>최대 기울기</span><b>{cert.maxTiltDeg.toFixed(1)}°</b></div>
      <div><span>팔레트</span><b>{usage.palletCount} EA</b></div>
      <div><span>박스 제외 보조자재</span><b>약 {usage.estimatedNonCargoWeightKg.toFixed(1)} kg</b></div>
    </div>
    <div className="certification-material-list">
      <span><b>밴딩</b>{usage.bandingStraps}줄 · {usage.bandingLengthM.toFixed(1)}m</span>
      <span><b>각대</b>{usage.cornerGuards}EA</span>
      <span><b>랩핑</b>{usage.wrappingLengthM.toFixed(0)}m</span>
      <span><b>미끄럼방지재</b>{usage.antiSlipMats}EA</span>
      <span><b>고정바</b>{usage.loadBars}EA</span>
      <span><b>추가 보강재 중량</b>약 {usage.estimatedAddedWeightKg.toFixed(1)}kg</span>
    </div>
    <p>팔레트 중량은 현재 시뮬레이션의 팔레트/기존 포장 중량을 합산하고, 밴딩·각대·필름·미끄럼방지재·고정바는 기본 단위중량으로 추정합니다. 실제 작업지시 전 현장 자재 규격으로 재계산하세요.</p>
  </article>, host);
}
