import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { validatePlacements } from './engine/constraints';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import { packOnPallets, type OptimizedPalletPackingResult, type PalletSpec } from './engine/palletOptimization';
import type { LoadingResult } from './engine/types';
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

type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletSnapshot };
type AdvancedTab = 'optimize' | 'edit' | 'work';

const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

export function sanitizeResultsPalletSpec(spec: PalletSpec): PalletSpec {
  return {
    ...spec,
    length: Math.max(0.01, Number(spec.length) || 0.01),
    width: Math.max(0.01, Number(spec.width) || 0.01),
    height: Math.max(0.01, Number(spec.height) || 0.01),
    tareWeightKg: Math.max(0, Number(spec.tareWeightKg) || 0),
    maxLoadKg: Math.max(0, Number(spec.maxLoadKg) || 0),
    maxStackLevels: Math.max(1, Math.min(7, Math.floor(Number(spec.maxStackLevels) || 1))),
  };
}

function toLoadingResult(detail: ResultsModalDetail, snapshot: PalletSnapshot | null): LoadingResult {
  if (!snapshot) return detail.result;
  const result = snapshot.result;
  return {
    placements: result.placements,
    remaining: result.remaining,
    loadedWeightKg: result.totalPalletizedWeightKg,
    usedVolumeM3: result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
    validationIssues: validatePlacements(detail.container, result.placements),
  };
}

export default function ResultsOverlay() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ResultsModalDetail | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>('optimize');
  const [palletSnapshot, setPalletSnapshot] = useState<PalletSnapshot | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<ResultsModalDetail>).detail;
      if (!next) return;
      setDetail(next);
      setPalletSnapshot((window as PalletWindow).__containerLoadingPalletSnapshot ?? null);
      setAdvanced(false);
      setAdvancedTab('optimize');
      setOpen(true);
    };
    window.addEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onPalletSnapshot = (event: Event) => {
      const next = (event as CustomEvent<PalletSnapshot>).detail;
      if (next) setPalletSnapshot(next);
    };
    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onPalletSnapshot);
    return () => window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onPalletSnapshot);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('results-modal-open', open);
    if (!open) return () => document.body.classList.remove('results-modal-open');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('results-modal-open');
    };
  }, [open]);

  const effectiveResult = useMemo(() => detail ? toLoadingResult(detail, palletSnapshot) : null, [detail, palletSnapshot]);
  const floor = useMemo(() => detail && effectiveResult ? analyzeFloorLoad(detail.container, effectiveResult, 12, 4) : null, [detail, effectiveResult]);
  const checks = useMemo(() => detail && floor && effectiveResult ? analyzeConstraints(detail.container, detail.cargo, effectiveResult, floor) : [], [detail, floor, effectiveResult]);
  const quality = useMemo(() => detail && effectiveResult ? assessWeightBalance(detail.container, effectiveResult) : null, [detail, effectiveResult]);
  const addresses = useMemo(() => detail && effectiveResult ? buildPlacementAddresses(effectiveResult.placements, detail.container.length) : [], [detail, effectiveResult]);
  const maxLayer = useMemo(() => addresses.reduce((max, item) => Math.max(max, item?.layer ?? 0), 0), [addresses]);
  const loadedByCargo = useMemo(() => {
    const map = new Map<string, number>();
    effectiveResult?.placements.forEach(p => map.set(p.cargoId, (map.get(p.cargoId) ?? 0) + 1));
    return map;
  }, [effectiveResult]);

  const updatePalletSpec = (field: keyof PalletSpec, rawValue: string) => {
    if (!detail || !palletSnapshot) return;
    const nextSpec = sanitizeResultsPalletSpec({ ...palletSnapshot.spec, [field]: Number(rawValue) });
    const nextResult = packOnPallets(detail.container, detail.cargo.filter(item => item.quantity > 0), nextSpec);
    const nextSnapshot: PalletSnapshot = { spec: nextSpec, result: nextResult };
    (window as PalletWindow).__containerLoadingPalletSnapshot = nextSnapshot;
    setPalletSnapshot(nextSnapshot);
    window.dispatchEvent(new CustomEvent<PalletSpec>(PALLET_SPEC_FROM_RESULTS_EVENT, { detail: nextSpec }));
  };

  if (!open || !detail || !floor || !effectiveResult) return null;
  const totalVolume = detail.container.length * detail.container.width * detail.container.height;
  const fillRate = totalVolume > 0 ? effectiveResult.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = detail.container.maxPayloadKg > 0 ? effectiveResult.loadedWeightKg / detail.container.maxPayloadKg * 100 : 0;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;

  return <div className="results-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="results-modal" role="dialog" aria-modal="true" aria-labelledby="results-modal-title">
      <header className="results-modal-header">
        <div><b id="results-modal-title">적재 결과</b><span>설계 결과 → 검증 → 현장 작업 준비 순서로 확인합니다.</span></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="결과창 닫기">닫기</button>
      </header>

      <article className="results-panel results-preview-info">
        <div className="results-panel-title"><b>미리보기 정보</b><span>{palletSnapshot ? '팔레트 모드' : '박스 모드'}</span></div>
        <div className="results-cargo-legend">
          {detail.cargo.slice(0, 12).map(item => <span key={item.id}><i style={{ background: cargoColor(item.id) }} />{item.id}</span>)}
          <span><i className="empty" />여유 공간</span>
        </div>
        {palletSnapshot && <div className="results-pallet-settings">
          <div className="results-pallet-settings-head"><div><b>팔레트 적재 설정</b><span>값을 바꾸면 메인 3D 팔레트 배치가 즉시 다시 계산됩니다.</span></div></div>
          <div className="results-pallet-spec-grid">
            <label>길이(m)<input type="number" step=".01" value={palletSnapshot.spec.length} onChange={event => updatePalletSpec('length', event.target.value)} /></label>
            <label>폭(m)<input type="number" step=".01" value={palletSnapshot.spec.width} onChange={event => updatePalletSpec('width', event.target.value)} /></label>
            <label>높이(m)<input type="number" step=".01" value={palletSnapshot.spec.height} onChange={event => updatePalletSpec('height', event.target.value)} /></label>
            <label>팔레트 중량(kg)<input type="number" min="0" value={palletSnapshot.spec.tareWeightKg} onChange={event => updatePalletSpec('tareWeightKg', event.target.value)} /></label>
            <label>최대 적재중량(kg)<input type="number" min="0" value={palletSnapshot.spec.maxLoadKg} onChange={event => updatePalletSpec('maxLoadKg', event.target.value)} /></label>
            <label>최대 적층단<input type="number" min="1" max="7" value={palletSnapshot.spec.maxStackLevels} onChange={event => updatePalletSpec('maxStackLevels', event.target.value)} /></label>
          </div>
          <div className="results-pallet-optimization-strip">
            <span>사용 팔레트 <b>{palletSnapshot.result.palletCount}</b></span>
            <span>적재 화물 <b>{palletSnapshot.result.placements.length} EA</b></span>
            <span>적층 팔레트 <b>{palletSnapshot.result.stackedPallets}</b></span>
            <span>선택 최적화 <b>{palletSnapshot.result.optimization.selectedStackTarget}단 · 바닥 {palletSnapshot.result.optimization.floorPositions}열</b></span>
          </div>
        </div>}
      </article>

      <div className="results-summary-grid">
        <article><span>부피 적재율</span><b>{fillRate.toFixed(1)}%</b><small>{effectiveResult.usedVolumeM3.toFixed(1)} / {totalVolume.toFixed(1)} m³</small></article>
        <article><span>중량 적재율</span><b>{weightRate.toFixed(1)}%</b><small>{effectiveResult.loadedWeightKg.toLocaleString()} / {detail.container.maxPayloadKg.toLocaleString()} kg</small></article>
        <article><span>적재 박스</span><b>{effectiveResult.placements.length} EA</b><small>{detail.cargo.length}개 품목</small></article>
        <article><span>최대 층수</span><b>{maxLayer} 층</b><small>균형 {quality?.grade ?? '-'}</small></article>
        <article className={failed ? 'bad' : warned ? 'warn' : 'good'}><span>제약조건</span><b>{failed ? `실패 ${failed}` : warned ? `확인 ${warned}` : '모두 통과'}</b><small>{checks.length}개 항목 검사</small></article>
      </div>

      <div className="results-main-grid">
        <article className="results-panel">
          <div className="results-panel-title"><b>품목별 적재 결과</b><span>색상은 3D와 동일</span></div>
          <div className="results-table-wrap"><table><thead><tr><th>품목</th><th>요청</th><th>적재</th><th>미적재</th><th>총 중량</th><th>크기(mm)</th></tr></thead><tbody>{detail.cargo.map(item => { const loaded = loadedByCargo.get(item.id) ?? 0; return <tr key={item.id}><td><span className="result-cargo-code"><i style={{ background: cargoColor(item.id) }} />{item.id}</span></td><td>{item.quantity}</td><td>{loaded}</td><td>{Math.max(0, item.quantity - loaded)}</td><td>{(loaded * item.weightKg).toLocaleString()} kg</td><td>{Math.round(item.length * 1000)}×{Math.round(item.width * 1000)}×{Math.round(item.height * 1000)}</td></tr>; })}</tbody></table></div>
        </article>
        <article className="results-panel results-floor-panel">
          <div className="results-panel-title"><b>바닥 하중 분포</b><span>평균 {floor.averageKgPerM2.toFixed(0)} · 최대 {floor.maxKgPerM2.toFixed(0)} kg/m²</span></div>
          <div className="results-heatmap">{floor.cells.map((cell, index) => { const ratio = floor.maxKgPerM2 > 0 ? cell.kgPerM2 / floor.maxKgPerM2 : 0; return <i key={index} data-level={ratio >= .72 ? 'high' : ratio >= .36 ? 'mid' : 'low'} title={`${cell.kgPerM2.toFixed(0)} kg/m²`} />; })}</div>
        </article>
      </div>

      <article className="results-panel results-constraints">
        <div className="results-panel-title"><b>제약조건 검사</b><span>실패 {failed} · 확인 {warned}</span></div>
        <div className="results-check-grid">{checks.map(check => <div key={check.id} data-status={check.status}><span>{check.label}</span><b>{check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패'}</b><small>{check.detail}</small></div>)}</div>
      </article>

      <button className="advanced-result-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? '고급 도구 닫기' : '고급 도구 열기'}</button>
      {advanced && <section className="results-advanced-workflow" aria-label="고급 결과 도구">
        <div className="results-advanced-tabs" role="tablist" aria-label="고급 도구 단계">
          <button type="button" role="tab" aria-selected={advancedTab === 'optimize'} className={advancedTab === 'optimize' ? 'active' : ''} onClick={() => setAdvancedTab('optimize')}>1. 비교 / 최적화</button>
          <button type="button" role="tab" aria-selected={advancedTab === 'edit'} className={advancedTab === 'edit' ? 'active' : ''} onClick={() => setAdvancedTab('edit')}>2. 수동 편집</button>
          <button type="button" role="tab" aria-selected={advancedTab === 'work'} className={advancedTab === 'work' ? 'active' : ''} onClick={() => setAdvancedTab('work')}>3. 작업 준비</button>
        </div>
        <div className="results-modal-advanced dashboard-right viewer-card">
          <Suspense fallback={<div className="results-loading">고급 분석 모듈을 불러오는 중…</div>}>
            {advancedTab === 'optimize' && <><AutoCorrectionPanel /><StrategyComparisonPanel /><SpareCapacityPanel /></>}
            {advancedTab === 'edit' && <><ManualPlacementEditor /><GroupMoveSuggestionPanel /><GroupDragController /></>}
            {advancedTab === 'work' && <><WorkSequencePanel /><ErgonomicRiskPanel /></>}
          </Suspense>
        </div>
      </section>}
    </section>
  </div>;
}