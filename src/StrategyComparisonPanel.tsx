import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { compareLoadingStrategies, type StrategyComparison } from './engine/strategyComparison';
import { planMultipleContainers } from './engine/multiContainerPlanner';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { writeStoredState } from './storage';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };

export default function StrategyComparisonPanel() {
  const [target, setTarget] = useState<Element | null>(null);
  const [detail, setDetail] = useState<LoadingDetail | null>(() => typeof window === 'undefined' ? null : ((window as LoadingWindow).__containerLoadingLatestResult ?? null));
  const [editingPriorities, setEditingPriorities] = useState(false);
  const [showFleetPlan, setShowFleetPlan] = useState(false);

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector('.advanced-tools-host'));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const latest = (window as LoadingWindow).__containerLoadingLatestResult;
    if (latest) setDetail(latest);
    const onResult = (event: Event) => setDetail((event as CustomEvent<LoadingDetail>).detail ?? null);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);

  const comparisons = useMemo(() => detail ? compareLoadingStrategies(detail.container, detail.cargo, detail.result) : [], [detail]);
  const fleetPlan = useMemo(() => detail && showFleetPlan ? planMultipleContainers(detail.container, detail.cargo, undefined, 20) : null, [detail, showFleetPlan]);

  const updatePriority = (cargoId: string, value: number) => {
    if (!detail) return;
    const cargo = detail.cargo.map(item => item.id === cargoId ? { ...item, unloadPriority: value > 0 ? Math.floor(value) : undefined } : item);
    const state = { container: detail.container, cargo };
    writeStoredState(state, true);
    setDetail({ ...detail, cargo });
  };

  if (!target || !detail) return null;

  return createPortal(<section className="dashboard-card strategy-panel">
    <div className="card-heading-row"><h2>10. 적재 방식과 대수 계획</h2><span>1번 파일 방식</span></div>
    <p className="strategy-help">현재 배치와 필요한 컨테이너 대수를 확인합니다. 모든 컨테이너에 같은 1번 파일 적재 방식을 적용합니다.</p>
    <div className="strategy-grid">
      {comparisons.map((item) => <StrategyCard key={item.strategy} item={item} />)}
    </div>
    <button className="strategy-priority-toggle" onClick={() => setEditingPriorities(v => !v)}>{editingPriorities ? '하역 순서 닫기' : '하역 순서 설정'}</button>
    {editingPriorities && <div className="unload-priority-editor">
      <div className="priority-guide"><b>하역 순서</b><span>1 = 가장 먼저 꺼냄(문쪽) · 숫자가 클수록 나중에 꺼냄(안쪽)</span></div>
      {detail.cargo.map(item => <label key={item.id}><span><b>{item.id}</b>{item.name}</span><input type="number" min="0" step="1" value={item.unloadPriority ?? 0} onChange={e => updatePriority(item.id, Number(e.target.value))} /></label>)}
    </div>}
    <button className="strategy-fleet-toggle" onClick={() => setShowFleetPlan(v => !v)}>{showFleetPlan ? '다중 컨테이너 계획 닫기' : '필요 컨테이너 대수 계산'}</button>
    {showFleetPlan && fleetPlan && <div className="fleet-plan">
      <div className="fleet-summary"><b>{fleetPlan.complete ? `${fleetPlan.containers.length}대로 전체 적재 가능` : `${fleetPlan.containers.length}대 계산 후 잔량 존재`}</b><span>총 {fleetPlan.totalLoaded}/{fleetPlan.totalRequested} EA 적재 · 잔량 {fleetPlan.totalRemaining} EA</span></div>
      <div className="fleet-list">{fleetPlan.containers.map(item => <article key={item.index}><b>{item.index}호 컨테이너</b><span>{item.loadedCount} EA</span><small>부피 {item.fillRatePct.toFixed(1)}% · 중량 {item.weightRatePct.toFixed(1)}% · 다음 잔량 {item.remainingCount} EA</small></article>)}</div>
      {fleetPlan.stoppedReason && <p className="fleet-warning">{fleetPlan.stoppedReason}</p>}
    </div>}
  </section>, target);
}

function StrategyCard({ item }: { item: StrategyComparison }) {
  return <article className="strategy-card active">
    <div className="strategy-card-head"><div><b>{item.label}</b><em>현재 적용</em></div></div>
    <p>{item.description}</p>
    <div className="strategy-metrics">
      <span>부피 적재율 <b>{item.fillRatePct.toFixed(1)}%</b></span>
      <span>수량 적재율 <b>{item.loadedRatePct.toFixed(1)}%</b></span>
      <span>안정성 <b>{item.stabilityScore.toFixed(0)}</b></span>
      <span>균형 <b>{item.balanceScore.toFixed(0)}</b></span>
      <span>최대 바닥하중 <b>{item.maxFloorLoadKgPerM2.toFixed(0)} kg/m²</b></span>
      <span>미적재 <b>{item.remainingCount} EA</b></span>
      <span>하역 편의 <b>{item.unloadingConfigured ? item.unloadingScore.toFixed(0) : '순서 미설정'}</b></span>
    </div>
  </article>;
}
