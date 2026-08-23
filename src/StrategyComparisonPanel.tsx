import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { compareLoadingStrategies, type StrategyComparison } from './engine/strategyComparison';
import { LOADING_RESULT_EVENT, LOADING_STRATEGY_STORAGE_KEY, type LoadingStrategy } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { readStoredState, writeStoredState } from './storage';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };

const strategyOrder: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];

export default function StrategyComparisonPanel() {
  const [target, setTarget] = useState<Element | null>(null);
  const [detail, setDetail] = useState<LoadingDetail | null>(() => typeof window === 'undefined' ? null : ((window as LoadingWindow).__containerLoadingLatestResult ?? null));
  const [active, setActive] = useState<LoadingStrategy>(() => {
    if (typeof window === 'undefined') return 'capacity';
    const value = localStorage.getItem(LOADING_STRATEGY_STORAGE_KEY);
    return value === 'stability' || value === 'unloading' ? value : 'capacity';
  });
  const [editingPriorities, setEditingPriorities] = useState(false);

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector('.dashboard-right'));
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

  const comparisons = useMemo(() => detail ? compareLoadingStrategies(detail.container, detail.cargo) : [], [detail]);
  const best = useMemo(() => [...comparisons].sort((a, b) => b.overallScore - a.overallScore)[0]?.strategy, [comparisons]);

  const applyStrategy = (strategy: LoadingStrategy) => {
    localStorage.setItem(LOADING_STRATEGY_STORAGE_KEY, strategy);
    setActive(strategy);
    const state = readStoredState();
    const source = state ?? (detail ? { container: detail.container, cargo: detail.cargo } : null);
    if (source) writeStoredState(source, true);
  };

  const updatePriority = (cargoId: string, value: number) => {
    if (!detail) return;
    const cargo = detail.cargo.map(item => item.id === cargoId ? { ...item, unloadPriority: value > 0 ? Math.floor(value) : undefined } : item);
    const state = { container: detail.container, cargo };
    writeStoredState(state, true);
    setDetail({ ...detail, cargo });
  };

  if (!target || !detail) return null;

  return createPortal(<section className="dashboard-card strategy-panel">
    <div className="card-heading-row"><h2>10. 적재 전략 비교</h2><span>{best ? `추천 ${strategyOrder.indexOf(best) + 1}안` : ''}</span></div>
    <p className="strategy-help">같은 화물을 3가지 목표로 다시 계산합니다. 점수는 전략별 의사결정 보조값이며 절대 안전등급이 아닙니다.</p>
    <div className="strategy-grid">
      {comparisons.map((item) => <StrategyCard key={item.strategy} item={item} active={active === item.strategy} best={best === item.strategy} onApply={() => applyStrategy(item.strategy)} />)}
    </div>
    <button className="strategy-priority-toggle" onClick={() => setEditingPriorities(v => !v)}>{editingPriorities ? '하역 순서 닫기' : '하역 순서 설정'}</button>
    {editingPriorities && <div className="unload-priority-editor">
      <div className="priority-guide"><b>하역 순서</b><span>1 = 가장 먼저 꺼냄(문쪽) · 숫자가 클수록 나중에 꺼냄(안쪽)</span></div>
      {detail.cargo.map(item => <label key={item.id}><span><b>{item.id}</b>{item.name}</span><input type="number" min="0" step="1" value={item.unloadPriority ?? 0} onChange={e => updatePriority(item.id, Number(e.target.value))} /></label>)}
    </div>}
  </section>, target);
}

function StrategyCard({ item, active, best, onApply }: { item: StrategyComparison; active: boolean; best: boolean; onApply: () => void }) {
  return <article className={`strategy-card ${active ? 'active' : ''}`}>
    <div className="strategy-card-head"><div><b>{item.label}</b>{best && <em>추천</em>}</div><strong>{item.overallScore.toFixed(0)}점</strong></div>
    <p>{item.description}</p>
    <div className="strategy-metrics">
      <span>부피 적재율 <b>{item.fillRatePct.toFixed(1)}%</b></span>
      <span>수량 적재율 <b>{item.loadedRatePct.toFixed(1)}%</b></span>
      <span>안정성 <b>{item.stabilityScore.toFixed(0)}</b></span>
      <span>균형 <b>{item.balanceScore.toFixed(0)}</b></span>
      <span>최대 바닥하중 <b>{item.maxFloorLoadKgPerM2.toFixed(0)} kg/m²</b></span>
      <span>미적재 <b>{item.remainingCount} EA</b></span>
      {item.strategy === 'unloading' && <span>하역 편의 <b>{item.unloadingConfigured ? item.unloadingScore.toFixed(0) : '순서 미설정'}</b></span>}
    </div>
    <button className={active ? 'strategy-applied' : ''} onClick={onApply}>{active ? '현재 적용 중' : '이 전략 적용'}</button>
  </article>;
}
