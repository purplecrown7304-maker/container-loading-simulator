import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import { cargoColor } from './cargoColors';
import { OPEN_RESULTS_MODAL_EVENT, type ResultsModalDetail } from './resultsModalEvents';

const StrategyComparisonPanel = lazy(() => import('./StrategyComparisonPanel'));
const SpareCapacityPanel = lazy(() => import('./SpareCapacityPanel'));
const ManualPlacementEditor = lazy(() => import('./ManualPlacementEditor'));
const GroupMoveSuggestionPanel = lazy(() => import('./GroupMoveSuggestionPanel'));
const GroupDragController = lazy(() => import('./GroupDragController'));
const WorkSequencePanel = lazy(() => import('./WorkSequencePanel'));
const ErgonomicRiskPanel = lazy(() => import('./ErgonomicRiskPanel'));
const AutoCorrectionPanel = lazy(() => import('./AutoCorrectionPanel'));

export default function ResultsOverlay() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ResultsModalDetail | null>(null);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<ResultsModalDetail>).detail;
      if (!next) return;
      setDetail(next);
      setAdvanced(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('results-modal-open', open);
    return () => document.body.classList.remove('results-modal-open');
  }, [open]);

  const floor = useMemo(() => detail ? analyzeFloorLoad(detail.container, detail.result, 12, 4) : null, [detail]);
  const checks = useMemo(() => detail && floor ? analyzeConstraints(detail.container, detail.cargo, detail.result, floor) : [], [detail, floor]);
  const quality = useMemo(() => detail ? assessWeightBalance(detail.container, detail.result) : null, [detail]);
  const addresses = useMemo(() => detail ? buildPlacementAddresses(detail.result.placements, detail.container.length) : [], [detail]);
  const maxLayer = useMemo(() => addresses.reduce((max, item) => Math.max(max, item?.layer ?? 0), 0), [addresses]);
  const loadedByCargo = useMemo(() => {
    const map = new Map<string, number>();
    detail?.result.placements.forEach(p => map.set(p.cargoId, (map.get(p.cargoId) ?? 0) + 1));
    return map;
  }, [detail]);

  if (!open || !detail || !floor) return null;
  const totalVolume = detail.container.length * detail.container.width * detail.container.height;
  const fillRate = totalVolume > 0 ? detail.result.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = detail.container.maxPayloadKg > 0 ? detail.result.loadedWeightKg / detail.container.maxPayloadKg * 100 : 0;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;

  return createPortal(
    <div className="results-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="results-modal" role="dialog" aria-modal="true" aria-label="적재 결과">
        <header className="results-modal-header">
          <div><b>적재 결과</b><span>핵심 결과만 한 화면에서 확인합니다.</span></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="결과창 닫기">✕</button>
        </header>

        <div className="results-summary-grid">
          <article><span>부피 적재율</span><b>{fillRate.toFixed(1)}%</b><small>{detail.result.usedVolumeM3.toFixed(1)} / {totalVolume.toFixed(1)} m³</small></article>
          <article><span>중량 적재율</span><b>{weightRate.toFixed(1)}%</b><small>{detail.result.loadedWeightKg.toLocaleString()} / {detail.container.maxPayloadKg.toLocaleString()} kg</small></article>
          <article><span>적재 박스</span><b>{detail.result.placements.length} EA</b><small>{detail.cargo.length}개 품목</small></article>
          <article><span>최대 층수</span><b>{maxLayer} 층</b><small>균형 {quality?.grade ?? '-'}</small></article>
          <article className={failed ? 'bad' : warned ? 'warn' : 'good'}><span>제약조건</span><b>{failed ? `실패 ${failed}` : warned ? `확인 ${warned}` : '모두 통과'}</b><small>{checks.length}개 항목 검사</small></article>
        </div>

        <div className="results-main-grid">
          <article className="results-panel">
            <div className="results-panel-title"><b>품목별 적재 결과</b><span>색상은 3D와 동일</span></div>
            <div className="results-table-wrap"><table><thead><tr><th>품목</th><th>요청</th><th>적재</th><th>미적재</th><th>총 중량</th><th>크기(mm)</th></tr></thead><tbody>{detail.cargo.map(item => { const loaded = loadedByCargo.get(item.id) ?? 0; return <tr key={item.id}><td><span className="result-cargo-code"><i style={{background:cargoColor(item.id)}}/>{item.id}</span></td><td>{item.quantity}</td><td>{loaded}</td><td>{Math.max(0,item.quantity-loaded)}</td><td>{(loaded*item.weightKg).toLocaleString()} kg</td><td>{Math.round(item.length*1000)}×{Math.round(item.width*1000)}×{Math.round(item.height*1000)}</td></tr>; })}</tbody></table></div>
          </article>

          <article className="results-panel results-floor-panel">
            <div className="results-panel-title"><b>바닥 하중 분포</b><span>평균 {floor.averageKgPerM2.toFixed(0)} · 최대 {floor.maxKgPerM2.toFixed(0)} kg/m²</span></div>
            <div className="results-heatmap">{floor.cells.map((cell,index) => { const ratio = floor.maxKgPerM2 > 0 ? cell.kgPerM2/floor.maxKgPerM2 : 0; return <i key={index} data-level={ratio>=.72?'high':ratio>=.36?'mid':'low'} title={`${cell.kgPerM2.toFixed(0)} kg/m²`}/>; })}</div>
          </article>
        </div>

        <article className="results-panel results-constraints">
          <div className="results-panel-title"><b>제약조건 검사</b><span>실패 {failed} · 확인 {warned}</span></div>
          <div className="results-check-grid">{checks.map(check => <div key={check.id} data-status={check.status}><span>{check.label}</span><b>{check.status==='pass'?'통과':check.status==='warn'?'확인':'실패'}</b><small>{check.detail}</small></div>)}</div>
        </article>

        <button className="advanced-result-toggle" type="button" onClick={() => setAdvanced(v => !v)}>{advanced ? '고급 분석 닫기' : '고급 분석 열기'}</button>
        {advanced && <div className="results-modal-advanced dashboard-right viewer-card">
          <Suspense fallback={<div className="results-loading">고급 분석 모듈을 불러오는 중…</div>}>
            <AutoCorrectionPanel />
            <StrategyComparisonPanel />
            <SpareCapacityPanel />
            <ManualPlacementEditor />
            <GroupMoveSuggestionPanel />
            <GroupDragController />
            <WorkSequencePanel />
            <ErgonomicRiskPanel />
          </Suspense>
        </div>}
      </section>
    </div>, document.body,
  );
}
