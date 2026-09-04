import type { WeightDistributionAnalysis } from './engine/weightDistribution';

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function offsetLabel(value: number, negative: string, positive: string) {
  if (Math.abs(value) < 1) return '중앙';
  return `${value < 0 ? negative : positive} ${Math.abs(value).toFixed(0)} mm`;
}

export default function WeightDistributionPanel({ analysis }: { analysis: WeightDistributionAnalysis }) {
  const maxCell = analysis.maxCell;
  const stateLabel = analysis.status === 'balanced' ? '분포 양호' : analysis.status === 'caution' ? '분포 확인' : '데이터 없음';

  return <aside className="weight-distribution-panel" aria-label="3D 무게 분포 분석">
    <header>
      <div>
        <b>3D 무게 분포</b>
        <span>20 × 8 바닥 격자 · 컨테이너 중심 L/2, W/2 기준</span>
      </div>
      <strong className={`weight-distribution-state ${analysis.status}`}>{stateLabel}</strong>
    </header>

    <div className="weight-distribution-metrics">
      <div><span>총 투영 중량</span><b>{analysis.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</b><small>모든 적재층 포함</small></div>
      <div><span>최대 국부하중</span><b>{(maxCell?.kgPerM2 ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b><small>kg/m² · 설정 경고 {analysis.localWarningKgPerM2.toLocaleString(undefined, { maximumFractionDigits: 0 })}</small></div>
      <div><span>화물 CG · 길이</span><b>{offsetLabel(analysis.centerOffsetMm.longitudinal, '안쪽', '문쪽')}</b><small>컨테이너 L/2 기준 편차</small></div>
      <div><span>화물 CG · 좌우</span><b>{offsetLabel(analysis.centerOffsetMm.lateral, '좌측', '우측')}</b><small>컨테이너 W/2 기준 · 높이 {analysis.centerOffsetMm.vertical.toFixed(0)} mm</small></div>
    </div>

    <div className="weight-distribution-balance">
      <div><span>안쪽 {pct(analysis.innerRatio)}</span><div className="weight-balance-track"><i style={{ width: pct(analysis.innerRatio) }} /></div><span>{pct(analysis.doorRatio)} 문쪽</span></div>
      <div><span>좌측 {pct(analysis.leftRatio)}</span><div className="weight-balance-track"><i style={{ width: pct(analysis.leftRatio) }} /></div><span>{pct(analysis.rightRatio)} 우측</span></div>
    </div>

    <div className="weight-distribution-legend"><span>낮음</span><i /><span>높음</span></div>
    <p className="weight-distribution-note">{analysis.messages[0]} {analysis.messages[1]} {analysis.messages[2]}</p>
  </aside>;
}
