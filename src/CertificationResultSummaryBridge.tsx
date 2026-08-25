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
      <div><span>INTERNAL INERTIA SIMULATION PASSED</span><b>관성 시뮬레이션 3종 내부 기준 통과 · 최종 적재안</b><small>{usage.levelLabel}</small></div>
      <strong>PASS</strong>
    </div>
    <div className="certification-result-kpi">
      <div><span>최대 이동</span><b>{mm(cert.maxHorizontalShiftM)}</b></div>
      <div><span>최대 기울기</span><b>{cert.maxTiltDeg.toFixed(1)}°</b></div>
      <div><span>{cert.mode === 'pallets' ? '팔레트' : '블로킹재'}</span><b>{cert.mode === 'pallets' ? `${usage.palletCount} EA` : `${usage.dunnageBlocks} EA`}</b></div>
      <div><span>박스 제외 보조자재</span><b>약 {usage.estimatedNonCargoWeightKg.toFixed(1)} kg</b></div>
    </div>
    <div className="certification-material-list">
      {usage.palletCount > 0 && <span><b>팔레트</b>{usage.palletCount}EA · {usage.palletWeightKg.toFixed(1)}kg</span>}
      {usage.bandingStraps > 0 && <span><b>밴딩</b>{usage.bandingStraps}줄 · {usage.bandingLengthM.toFixed(1)}m</span>}
      {usage.cornerGuards > 0 && <span><b>각대</b>{usage.cornerGuards}EA</span>}
      {usage.wrappingLengthM > 0 && <span><b>랩핑</b>{usage.wrappingLengthM.toFixed(0)}m</span>}
      {usage.antiSlipMats > 0 && <span><b>미끄럼방지재</b>{usage.antiSlipMats}EA</span>}
      {usage.dunnageBlocks > 0 && <span><b>블로킹재</b>{usage.dunnageBlocks}EA</span>}
      {usage.loadBars > 0 && <span><b>고정바</b>{usage.loadBars}EA</span>}
      <span><b>추가 보강재 중량</b>약 {usage.estimatedAddedWeightKg.toFixed(1)}kg</span>
    </div>
    <p>이 PASS는 시뮬레이터 내부 비교 기준(최대 이동 12 mm 이하, 최대 기울기 1.8° 이하)을 뜻하며 실제 운송 안전 인증을 의미하지 않습니다. 팔레트·밴딩·각대·필름·미끄럼방지재·블로킹재·고정바의 중량은 현재 모델 값 또는 기본 단위중량 추정값이므로, 작업지시 전 현장 자재 규격으로 재계산하세요.</p>
  </article>, host);
}
