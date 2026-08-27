import {
  createPhysicsTargetSignature,
  type InertiaReinforcementAttempt,
  type InertiaScenario,
} from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';
import { readPhysicsTarget } from './physicsTarget';
import type { ResultsModalDetail } from './resultsModalEvents';

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
  const detail = [
    `전체 ${mm(failed.maxHorizontalShiftM)}`,
    failed.maxCargoRelativeSlipM != null ? `화물미끄럼 ${mm(failed.maxCargoRelativeSlipM)}` : '',
    failed.maxSupportShiftM != null ? `팔레트이동 ${mm(failed.maxSupportShiftM)}` : '',
    `기울기 ${failed.maxTiltDeg.toFixed(1)}°`,
  ].filter(Boolean).join(' · ');
  return `${scenarioLabel(failed.scenario)} 실패 · ${detail}`;
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
    beforeCargoSlipM: failed.maxCargoRelativeSlipM,
    afterCargoSlipM: finalScenario.maxCargoRelativeSlipM,
    beforeSupportShiftM: failed.maxSupportShiftM,
    afterSupportShiftM: finalScenario.maxSupportShiftM,
    finalLabel: finalAttempt.levelLabel,
  };
}

export default function CertificationResultSummary({ detail }: { detail: ResultsModalDetail }) {
  if (!detail.certification || detail.certification.status !== 'passed') return null;
  const cert = detail.certification;
  const usage = cert.securing;
  const attempts = cert.attempts ?? [];
  const comparison = reinforcementComparison(attempts);
  const palletMode = cert.mode === 'pallets';
  const target = palletMode ? readPhysicsTarget() : undefined;
  const palletPlan = target
    && target.mode === 'pallets'
    && cert.targetSignature === createPhysicsTargetSignature(target)
    ? buildPalletSecuringPlan(target, usage)
    : null;

  return <article className="certification-result-card">
    <div className="certification-result-head">
      <div><span>INTERNAL INERTIA SIMULATION PASSED</span><b>관성 시뮬레이션 3종 내부 기준 통과 · 최종 적재안</b><small>{usage.levelLabel}</small></div>
      <strong>PASS</strong>
    </div>
    <div className="certification-result-kpi">
      <div><span>컨테이너 기준 최대 이동</span><b>{mm(cert.maxHorizontalShiftM)}</b></div>
      <div><span>최대 기울기</span><b>{cert.maxTiltDeg.toFixed(1)}°</b></div>
      {palletMode && <div><span>화물↔팔레트 상대 미끄럼</span><b>{mm(cert.maxCargoRelativeSlipM ?? 0)}</b></div>}
      {palletMode && <div><span>팔레트 자체 최대 이동</span><b>{mm(cert.maxSupportShiftM ?? 0)}</b></div>}
      <div><span>{palletMode ? '팔레트' : '블로킹재'}</span><b>{palletMode ? `${usage.palletCount} EA` : `${usage.dunnageBlocks} EA`}</b></div>
      <div><span>박스 제외 보조자재</span><b>약 {usage.estimatedNonCargoWeightKg.toFixed(1)} kg</b></div>
    </div>

    {comparison && <section className="certification-effect" aria-label="보강 전후 관성 비교">
      <div><b>보강 효과 비교 · {scenarioLabel(comparison.scenario)}</b><span>기본 적재안 → {comparison.finalLabel}</span></div>
      <div className="certification-effect-grid">
        <p><span>전체 수평 이동</span><b>{mm(comparison.beforeShiftM)} → {mm(comparison.afterShiftM)}</b><small>{reductionPercent(comparison.beforeShiftM, comparison.afterShiftM).toFixed(0)}% 감소</small></p>
        <p><span>기울기</span><b>{comparison.beforeTiltDeg.toFixed(1)}° → {comparison.afterTiltDeg.toFixed(1)}°</b><small>{reductionPercent(comparison.beforeTiltDeg, comparison.afterTiltDeg).toFixed(0)}% 감소</small></p>
        {comparison.beforeCargoSlipM != null && comparison.afterCargoSlipM != null && <p><span>화물↔팔레트 미끄럼</span><b>{mm(comparison.beforeCargoSlipM)} → {mm(comparison.afterCargoSlipM)}</b><small>{reductionPercent(comparison.beforeCargoSlipM, comparison.afterCargoSlipM).toFixed(0)}% 감소</small></p>}
        {comparison.beforeSupportShiftM != null && comparison.afterSupportShiftM != null && <p><span>팔레트 자체 이동</span><b>{mm(comparison.beforeSupportShiftM)} → {mm(comparison.afterSupportShiftM)}</b><small>{reductionPercent(comparison.beforeSupportShiftM, comparison.afterSupportShiftM).toFixed(0)}% 감소</small></p>}
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
      {(cert.maxCargoRestraintForceN ?? 0) > 0 && <span><b>최대 화물 구속력</b>{((cert.maxCargoRestraintForceN ?? 0) / 1000).toFixed(1)}kN</span>}
      {(cert.maxSupportRestraintForceN ?? 0) > 0 && <span><b>최대 팔레트 구속력</b>{((cert.maxSupportRestraintForceN ?? 0) / 1000).toFixed(1)}kN</span>}
    </div>
    <p>이 PASS는 시뮬레이터 내부 비교 기준이며 실제 운송 안전 인증을 의미하지 않습니다. 팔레트 모드에서는 전체 이동·기울기 외에 화물-팔레트 상대 미끄럼과 팔레트 자체 이동을 별도로 제한합니다. 계산된 구속력은 내부 물리모델의 비교값이며 실제 밴딩·고정바 정격을 대체하지 않습니다.</p>
  </article>;
}
