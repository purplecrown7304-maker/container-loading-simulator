import { uiWorkflowText } from './workflowPresentation';
import { uiText, useUiLanguage } from './uiLanguage';
import type { WeightDistributionAnalysis } from './engine/weightDistribution';

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function offsetLabel(value: number, negative: string, positive: string) {
  if (Math.abs(value) < 1) return uiText('중앙');
  return `${uiText(value < 0 ? negative : positive)} ${Math.abs(value).toFixed(0)} mm`;
}

export default function WeightDistributionPanel({ analysis }: { analysis: WeightDistributionAnalysis }) {
  useUiLanguage();
  const maxCell = analysis.maxCell;
  const stateLabel = analysis.status === 'balanced' ? '분포 양호' : analysis.status === 'caution' ? '분포 확인' : '데이터 없음';

  return <aside className="weight-distribution-panel" aria-label={uiText("3D 무게 분포 분석")}>
    <header>
      <div>
        <b>{uiText("3D 무게 분포")}</b>
        <span>{uiText("20 × 8 바닥 격자 · 컨테이너 중심 L/2, W/2 기준")}</span>
      </div>
      <strong className={`weight-distribution-state ${analysis.status}`}>{uiText(stateLabel)}</strong>
    </header>

    <div className="weight-distribution-metrics">
      <div><span>{uiText("총 투영 중량")}</span><b>{analysis.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</b><small>{uiText("모든 적재층 포함")}</small></div>
      <div><span>{uiText("최대 국부하중")}</span><b>{(maxCell?.kgPerM2 ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b><small>{uiText("kg/m² · 설정 경고 {0}", [analysis.localWarningKgPerM2.toLocaleString(undefined, { maximumFractionDigits: 0 })])}</small></div>
      <div><span>{uiText("화물 CG · 길이")}</span><b>{offsetLabel(analysis.centerOffsetMm.longitudinal, '안쪽', '문쪽')}</b><small>{uiText("컨테이너 L/2 기준 편차")}</small></div>
      <div><span>{uiText("화물 CG · 좌우")}</span><b>{offsetLabel(analysis.centerOffsetMm.lateral, '좌측', '우측')}</b><small>{uiText("컨테이너 W/2 기준 · 높이 {0} mm", [analysis.centerOffsetMm.vertical.toFixed(0)])}</small></div>
    </div>

    <div className="weight-distribution-balance">
      <div><span>{uiText("안쪽 {0}", [pct(analysis.innerRatio)])}</span><div className="weight-balance-track"><i style={{ width: pct(analysis.innerRatio) }} /></div><span>{uiText("{0} 문쪽", [pct(analysis.doorRatio)])}</span></div>
      <div><span>{uiText("좌측 {0}", [pct(analysis.leftRatio)])}</span><div className="weight-balance-track"><i style={{ width: pct(analysis.leftRatio) }} /></div><span>{uiText("{0} 우측", [pct(analysis.rightRatio)])}</span></div>
    </div>

    <div className="weight-distribution-legend"><span>{uiText("낮음")}</span><i /><span>{uiText("높음")}</span></div>
    <p className="weight-distribution-note">{analysis.messages.map(message => uiWorkflowText(message)).join(' ')}</p>
  </aside>;
}
