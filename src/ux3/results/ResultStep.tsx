import type { ConstraintCheck } from '../../engine/constraintAnalysis';
import type { CargoItem, LoadingResult } from '../../engine/types';
import type { BalanceAssessment } from '../../engine/weightBalance';
import type { PhysicsSummary, ResultTab } from '../types';

type Props = {
  tab: ResultTab;
  result: LoadingResult;
  cargo: CargoItem[];
  requestedQty: number;
  totalVolume: number;
  maxPayloadKg: number;
  fillRate: number;
  weightRate: number;
  quality: BalanceAssessment;
  checks: ConstraintCheck[];
  hardFailure: boolean;
  safetyWarning: boolean;
  centerOfGravityWarning: boolean;
  physics: PhysicsSummary;
  onTab: (tab: ResultTab) => void;
};

export default function ResultStep({ tab, result, cargo, requestedQty, totalVolume, maxPayloadKg, fillRate, weightRate, quality, checks, hardFailure, safetyWarning, centerOfGravityWarning, physics, onTab }: Props) {
  const remainingQty = result.remaining.reduce((sum, item) => sum + item.quantity, 0);
  const physicsWarning = !physics || !physics.settled || physics.unstableCount + physics.supportUnstableCount > 0 || physics.score < 85;
  const overallWarning = centerOfGravityWarning || safetyWarning || physicsWarning;

  return <section className="ux3-step-page ux3-result-page">
    <div className="ux3-page-heading">
      <div><span>STEP 4</span><h1>적재 결과</h1><p>경고는 숨기지 않되 작업지시서 발급 자체는 막지 않습니다. 물리 안전 실패는 실제 작업 전에 반드시 해결해야 합니다.</p></div>
      <div className={`ux3-result-grade ${hardFailure ? 'danger' : overallWarning ? 'warning' : 'success'}`}><span>적재 품질</span><b>{quality.grade}</b></div>
    </div>

    <div className="ux3-result-tabs" role="tablist">
      <button type="button" className={tab === 'result' ? 'active' : ''} onClick={() => onTab('result')}>적재 결과</button>
      <button type="button" className={tab === 'remaining' ? 'active' : ''} onClick={() => onTab('remaining')}>미적재 <span>{remainingQty}</span></button>
      <button type="button" className={tab === 'weight' ? 'active' : ''} onClick={() => onTab('weight')}>무게 분포</button>
      <button type="button" className={tab === 'safety' ? 'active' : ''} onClick={() => onTab('safety')}>안전 검사</button>
    </div>

    {tab === 'result' && <div className="ux3-result-grid">
      <section className="ux3-card ux3-metric-card"><span>요청</span><b>{requestedQty} EA</b><small>{cargo.filter(item => item.quantity > 0).length}종</small></section>
      <section className="ux3-card ux3-metric-card"><span>적재</span><b>{result.placements.length} EA</b><small>{requestedQty > 0 ? (result.placements.length / requestedQty * 100).toFixed(1) : '0.0'}%</small></section>
      <section className="ux3-card ux3-metric-card"><span>미적재</span><b>{remainingQty} EA</b><small>{result.remaining.length ? '사유 탭 확인' : '잔량 없음'}</small></section>
      <section className="ux3-card ux3-metric-card"><span>적재 중량</span><b>{result.loadedWeightKg.toLocaleString()} kg</b><small>{weightRate.toFixed(1)}% / {maxPayloadKg.toLocaleString()}kg</small></section>
      <section className="ux3-card ux3-metric-card"><span>사용 용적</span><b>{result.usedVolumeM3.toFixed(1)} m³</b><small>{fillRate.toFixed(1)}% / {totalVolume.toFixed(1)}m³</small></section>
      <section className="ux3-card ux3-metric-card"><span>무게중심 품질</span><b>{quality.loadingQualityScore.toFixed(0)} 점</b><small>등급 {quality.grade} · 차단 조건 아님</small></section>
      <section className="ux3-card ux3-result-wide"><h2>현재 판정</h2><div className="ux3-result-callouts">
        {hardFailure && <div className="danger"><b>안전 실패 항목 있음</b><span>작업지시서는 생성되지만 실제 적재 전에 안전 검사 탭의 실패 항목을 해결해야 합니다.</span></div>}
        {!hardFailure && overallWarning && <div className="warning"><b>경고/확인 항목 있음</b><span>무게중심·관성·현장 확인 항목은 경고로 표시되며 적재 결과와 작업지시서를 차단하지 않습니다.</span></div>}
        {!hardFailure && !overallWarning && <div className="success"><b>주요 검사 양호</b><span>현재 계산 결과에서 즉시 확인할 실패/경고 항목이 없습니다.</span></div>}
      </div></section>
    </div>}

    {tab === 'remaining' && <section className="ux3-card ux3-result-panel">
      <div className="ux3-card-head"><div><h2>미적재 화물</h2><span>최적화 엔진이 반환한 사유를 그대로 표시합니다.</span></div></div>
      {result.remaining.length ? <div className="ux3-remaining-list">{result.remaining.map((item, index) => <article key={`${item.cargoId}-${index}`}><div><b>{item.cargoId}</b><span>{cargo.find(candidate => candidate.id === item.cargoId)?.name ?? ''}</span></div><strong>{item.quantity} EA</strong><p>{item.reason}</p></article>)}</div> : <div className="ux3-empty ux3-empty-success"><b>미적재 화물이 없습니다.</b><span>요청 수량이 모두 적재되었습니다.</span></div>}
    </section>}

    {tab === 'weight' && <div className="ux3-weight-layout">
      <section className="ux3-card ux3-weight-score"><div><span>컨테이너 기준 무게중심</span><b>X {quality.centerOfGravity.x.toFixed(2)}m · Y {quality.centerOfGravity.y.toFixed(2)}m · Z {quality.centerOfGravity.z.toFixed(2)}m</b></div><div className="ux3-weight-bars">
        <label>앞뒤 중앙 편차 <b>{quality.longitudinalDeviationPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.longitudinalDeviationPct)}%` }} /></span></label>
        <label>좌우 중앙 편차 <b>{quality.lateralDeviationPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.lateralDeviationPct)}%` }} /></span></label>
        <label>무게중심 높이 <b>{quality.verticalCenterPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.verticalCenterPct)}%` }} /></span></label>
      </div></section>
      <section className="ux3-card ux3-weight-messages"><h2>평가 메모</h2>{quality.messages.map((message, index) => <p key={`${index}-${message}`}>{message}</p>)}<div className={`ux3-advisory ${centerOfGravityWarning ? 'warning' : 'success'}`}><b>{centerOfGravityWarning ? '무게중심 경고' : '무게중심 양호'}</b><span>무게중심은 컨테이너 기하학적 중심을 기준으로 평가하며 적재 중단 또는 작업지시서 발급 차단 조건이 아닙니다.</span></div></section>
    </div>}

    {tab === 'safety' && <section className="ux3-card ux3-result-panel">
      <div className="ux3-card-head"><div><h2>안전 검사</h2><span>하드 제약 위반과 경고/품질 평가를 분리해 표시합니다.</span></div></div>
      <div className="ux3-safety-list">
        {checks.map(check => <article key={check.id} className={`ux3-safety-${check.status}`}><span className="ux3-safety-icon">{check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '×'}</span><div><b>{check.label}</b><p>{check.detail}</p></div><strong>{check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패'}</strong></article>)}
        <article className={centerOfGravityWarning ? 'ux3-safety-warn' : 'ux3-safety-pass'}><span className="ux3-safety-icon">{centerOfGravityWarning ? '!' : '✓'}</span><div><b>컨테이너 무게중심</b><p>앞뒤 {quality.longitudinalDeviationPct.toFixed(1)}% · 좌우 {quality.lateralDeviationPct.toFixed(1)}% · 높이 {quality.verticalCenterPct.toFixed(1)}% · 경고여도 적재/작업지시서 차단 없음</p></div><strong>{centerOfGravityWarning ? '경고' : '양호'}</strong></article>
        <article className={physicsWarning ? 'ux3-safety-warn' : 'ux3-safety-pass'}><span className="ux3-safety-icon">{physicsWarning ? '!' : '✓'}</span><div><b>운송 물리/관성 참고</b><p>{physics ? `Rapier 점수 ${physics.score.toFixed(0)} · 정착 ${physics.settled ? '완료' : '미완료'} · 불안정 ${physics.unstableCount + physics.supportUnstableCount}개` : '현재 단계에서 별도 관성 결과가 없습니다. 작업지시서 발급은 가능하며 출고 전 현장 확인이 필요합니다.'}</p></div><strong>{physicsWarning ? '경고' : '양호'}</strong></article>
      </div>
    </section>}
  </section>;
}
