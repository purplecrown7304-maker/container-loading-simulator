import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createPhysicsTargetSignature,
  type InertiaReinforcementAttempt,
  type InertiaScenario,
} from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';
import { readPhysicsTarget } from './physicsTarget';
import { OPEN_RESULTS_MODAL_EVENT, type ResultsModalDetail } from './resultsModalEvents';

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
}

function scenarioLabel(value: InertiaScenario) {
  return value === 'acceleration' ? '출발 가속' : value === 'braking' ? '급정거' : '급회전';
}

function attemptText(attempt: InertiaReinforcementAttempt) {
  if (!attempt.payloadWithinLimit) return '보조자재 포함 최대중량 초과';
  if (attempt.passed) return '3종 PASS';
  const failed = attempt.scenarios.find(item => !item.passed);
  if (!failed) return '검증 미완료';
  return `${scenarioLabel(failed.scenario)} 실패 · ${mm(failed.maxHorizontalShiftM)} / ${failed.maxTiltDeg.toFixed(1)}°`;
}

function reductionPercent(before: number, after: number) {
  if (before <= 0) return 0;
  return Math.max(0, (1 - after / before) * 100);
}

function reinforcementComparison(attempts: InertiaReinforcementAttempt[]) {
  const baseline = attempts.find(attempt => attempt.level === 0);
  if (!baseline || baseline.passed) return null;
  const failed = baseline.scenarios.find(scenario => !scenario.passed);
  if (!failed) return null;
  const finalAttempt = [...attempts].reverse().find(attempt => attempt.passed);
  const finalScenario = finalAttempt?.scenarios.find(scenario => scenario.scenario === failed.scenario);
  if (!finalAttempt || !finalScenario) return null;
  return {
    scenario: failed.scenario,
    beforeShiftM: failed.maxHorizontalShiftM,
    afterShiftM: finalScenario.maxHorizontalShiftM,
    beforeTiltDeg: failed.maxTiltDeg,
    afterTiltDeg: finalScenario.maxTiltDeg,
    finalLabel: finalAttempt.levelLabel,
  };
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
  const attempts = cert.attempts ?? [];
  const comparison = reinforcementComparison(attempts);
  const target = cert.mode === 'pallets' ? readPhysicsTarget() : undefined;
  const palletPlan = target
    && target.mode === 'pallets'
    && cert.targetSignature === createPhysicsTargetSignature(target)
    ? buildPalletSecuringPlan(target, usage)
    : null;

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

    {comparison && <section className="certification-effect" aria-label="보강 전후 관성 비교">
      <div><b>보강 효과 비교 · {scenarioLabel(comparison.scenario)}</b><span>기본 적재안 → {comparison.finalLabel}</span></div>
      <div className="certification-effect-grid">
        <p><span>수평 이동</span><b>{mm(comparison.beforeShiftM)} → {mm(comparison.afterShiftM)}</b><small>{reductionPercent(comparison.beforeShiftM, comparison.afterShiftM).toFixed(0)}% 감소</small></p>
        <p><span>기울기</span><b>{comparison.beforeTiltDeg.toFixed(1)}° → {comparison.afterTiltDeg.toFixed(1)}°</b><small>{reductionPercent(comparison.beforeTiltDeg, comparison.afterTiltDeg).toFixed(0)}% 감소</small></p>
      </div>
    </section>}

    {attempts.length > 0 && <section className="certification-attempt-trail" aria-label="자동 보강 이력">
      <div className="certification-attempt-title"><b>자동 보강 이력</b><span>통과할 때까지 필요한 보강만 단계적으로 추가했습니다.</span></div>
      <div className="certification-attempt-steps">
        {attempts.map((attempt, index) => <div key={`${attempt.level}-${index}`} className={attempt.passed ? 'passed' : 'failed'}>
          <span>{index + 1}</span>
          <p><b>{attempt.level === 0 ? '기본 적재안' : attempt.levelLabel}</b><small>{attemptText(attempt)}</small></p>
        </div>)}
      </div>
    </section>}

    {palletPlan && palletPlan.items.length > 0 && <section className="certification-pallet-plan" aria-label="팔레트별 결속 계획">
      <div className="certification-pallet-plan-head"><b>팔레트별 결속 계획</b><span>각 팔레트의 실제 적재 높이로 길이를 계산했습니다.</span></div>
      <div className="certification-pallet-plan-grid">
        {[...palletPlan.items].sort((a, b) => a.palletIndex - b.palletIndex).map(item => <article key={item.supportId}>
          <header><b>P{item.palletIndex}</b><span>적재높이 {Math.round(item.loadHeightM * 1000)} mm</span></header>
          <p><span>밴딩</span><b>{item.bandingStraps}줄 · {item.bandingLengthM.toFixed(1)}m</b></p>
          <p><span>각대</span><b>{item.cornerGuards}EA · {item.cornerGuardLengthM.toFixed(1)}m</b></p>
          <p><span>랩핑</span><b>{item.wrappingLengthM > 0 ? `${item.wrappingLengthM.toFixed(1)}m` : '-'}</b></p>
          <p><span>미끄럼방지</span><b>{item.antiSlipMats > 0 ? `${item.antiSlipMats}EA` : '-'}</b></p>
          <footer>추가 약 {item.estimatedAddedWeightKg.toFixed(2)} kg</footer>
        </article>)}
      </div>
      {palletPlan.sharedLoadBars > 0 && <div className="certification-shared-securing"><b>컨테이너 공통 고정바</b><span>{palletPlan.sharedLoadBars}EA · 약 {palletPlan.sharedLoadBarWeightKg.toFixed(1)}kg</span></div>}
    </section>}

    <div className="certification-material-list">
      {usage.palletCount > 0 && <span><b>팔레트</b>{usage.palletCount}EA · {usage.palletWeightKg.toFixed(1)}kg</span>}
      {usage.bandingStraps > 0 && <span><b>밴딩</b>{usage.bandingStraps}줄 · {usage.bandingLengthM.toFixed(1)}m</span>}
      {usage.cornerGuards > 0 && <span><b>각대</b>{usage.cornerGuards}EA · {usage.cornerGuardLengthM.toFixed(1)}m</span>}
      {usage.wrappingLengthM > 0 && <span><b>랩핑</b>{usage.wrappingLengthM.toFixed(0)}m</span>}
      {usage.antiSlipMats > 0 && <span><b>미끄럼방지재</b>{usage.antiSlipMats}EA</span>}
      {usage.dunnageBlocks > 0 && <span><b>블로킹재</b>{usage.dunnageBlocks}EA</span>}
      {usage.loadBars > 0 && <span><b>고정바</b>{usage.loadBars}EA</span>}
      <span><b>추가 보강재 중량</b>약 {usage.estimatedAddedWeightKg.toFixed(1)}kg</span>
    </div>
    <p>이 PASS는 시뮬레이터 내부 비교 기준(최대 이동 12 mm 이하, 최대 기울기 1.8° 이하)을 뜻하며 실제 운송 안전 인증을 의미하지 않습니다. 보조자재 중량은 저장된 현장 단위중량을 사용하므로 실제 작업 전 자재 규격·정격을 확인하세요.</p>
  </article>, host);
}
