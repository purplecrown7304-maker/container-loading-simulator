import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LOADING_STRATEGY_DECISION_EVENT,
  LOADING_STRATEGY_SELECTION_EVENT,
  readStrategyDecision,
  readUserLoadingStrategy,
  STRATEGY_LABELS,
  writeUserLoadingStrategy,
  type StrategyDecision,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import './loading-strategy.css';

const MODES: Array<{ id: UserLoadingStrategy; icon: string }> = [
  { id: 'auto', icon: '◎' },
  { id: 'capacity', icon: '▦' },
  { id: 'balance', icon: '⚖' },
  { id: 'safety', icon: '⬢' },
  { id: 'unloading', icon: '⇥' },
  { id: 'grouping', icon: '▥' },
];

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type PalletSnapshotLite = {
  result?: {
    palletCount?: number;
    placements?: unknown[];
    remaining?: Array<{ cargoId: string; quantity: number; reason: string }>;
    totalPalletizedWeightKg?: number;
  };
};
type LoadingWindow = Window & {
  __containerLoadingLatestResult?: LoadingDetail;
  __containerLoadingPalletSnapshot?: PalletSnapshotLite;
};

function latestLoading(): LoadingDetail | undefined {
  return typeof window === 'undefined' ? undefined : (window as LoadingWindow).__containerLoadingLatestResult;
}
function palletSnapshot() {
  return typeof window === 'undefined' ? undefined : (window as LoadingWindow).__containerLoadingPalletSnapshot;
}
function palletModeActive() {
  if (typeof document === 'undefined') return false;
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트');
}

export default function LoadingStrategyDock() {
  const [strategy, setStrategy] = useState<UserLoadingStrategy>(() => readUserLoadingStrategy());
  const [decision, setDecision] = useState<StrategyDecision | undefined>(() => readStrategyDecision());
  const [loading, setLoading] = useState<LoadingDetail | undefined>(() => latestLoading());
  const [palletRevision, setPalletRevision] = useState(0);
  const [selectorHost, setSelectorHost] = useState<HTMLElement | null>(null);
  const [resultHost, setResultHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const mount = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stage = document.querySelector<HTMLElement>('.guided-loading-placeholder');
        if (stage) {
          stage.removeAttribute('aria-hidden');
          stage.classList.add('loading-strategy-stage-host');
          setSelectorHost(current => current === stage ? current : stage);
        } else setSelectorHost(null);
        const resultStage = document.querySelector<HTMLElement>('.guided-result-stage');
        if (!resultStage) { setResultHost(null); return; }
        let host = resultStage.querySelector<HTMLElement>(':scope > .loading-strategy-result-host');
        if (!host) {
          host = document.createElement('div');
          host.className = 'loading-strategy-result-host';
          const tabs = resultStage.querySelector('.guided-result-tabs');
          tabs?.insertAdjacentElement('afterend', host);
          if (!tabs) resultStage.prepend(host);
        }
        setResultHost(current => current === host ? current : host);
      });
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const onSelection = (event: Event) => setStrategy((event as CustomEvent<UserLoadingStrategy>).detail ?? readUserLoadingStrategy());
    const onDecision = (event: Event) => setDecision((event as CustomEvent<StrategyDecision>).detail ?? readStrategyDecision());
    const onResult = (event: Event) => setLoading((event as CustomEvent<LoadingDetail>).detail ?? latestLoading());
    const onPallet = () => setPalletRevision(value => value + 1);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onSelection);
    window.addEventListener(LOADING_STRATEGY_DECISION_EVENT, onDecision);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    window.addEventListener('container-loading:pallet-snapshot-updated', onPallet);
    return () => {
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onSelection);
      window.removeEventListener(LOADING_STRATEGY_DECISION_EVENT, onDecision);
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
      window.removeEventListener('container-loading:pallet-snapshot-updated', onPallet);
    };
  }, []);

  const select = (id: UserLoadingStrategy) => { setStrategy(id); writeUserLoadingStrategy(id); };
  const selector = selectorHost ? createPortal(
    <section className="loading-strategy-selector" aria-label="자동 적재 방식 선택">
      <div className="loading-strategy-title"><div><span>AUTO LOADING</span><h1>적재 방식 선택</h1></div><strong>{STRATEGY_LABELS[strategy]}</strong></div>
      <div className="loading-strategy-grid">
        {MODES.map(mode => <button key={mode.id} type="button" className={strategy === mode.id ? 'active' : ''} onClick={() => select(mode.id)}>
          <i>{mode.icon}</i><b>{STRATEGY_LABELS[mode.id]}</b>{strategy === mode.id && <em>✓</em>}
        </button>)}
      </div>
      {strategy === 'auto' && <div className="loading-strategy-auto-note">화물 특성 분석 후 공간·무게·안전·하차·그룹화 가중치를 자동 조정</div>}
    </section>, selectorHost) : null;

  const metrics = useMemo(() => {
    if (!loading) return null;
    const { container, result } = loading;
    const volume = Math.max(0.001, container.length * container.width * container.height);
    const balance = assessWeightBalance(container, result);
    const pallet = palletSnapshot()?.result;
    const usePallet = palletModeActive() && (pallet?.palletCount ?? 0) > 0;
    return {
      fill: result.usedVolumeM3 / volume * 100,
      used: result.usedVolumeM3,
      remaining: Math.max(0, volume - result.usedVolumeM3),
      weight: usePallet ? (pallet?.totalPalletizedWeightKg ?? result.loadedWeightKg) : result.loadedWeightKg,
      lateral: balance.lateralDeviationPct,
      longitudinal: balance.longitudinalDeviationPct,
      cog: balance.centerOfGravity,
      boxes: usePallet ? (pallet?.placements?.length ?? result.placements.length) : result.placements.length,
      pallets: usePallet ? (pallet?.palletCount ?? 0) : 0,
      unloaded: usePallet
        ? (pallet?.remaining ?? []).reduce((sum, item) => sum + item.quantity, 0)
        : result.remaining.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [loading, palletRevision]);

  const resultPanel = resultHost && metrics ? createPortal(
    <section className="loading-strategy-result-summary">
      <div className="loading-strategy-result-head"><b>{decision ? STRATEGY_LABELS[decision.selectedStrategy] : STRATEGY_LABELS[strategy]}</b><span>{decision?.requestedStrategy === 'auto' ? `자동 종합점수 ${decision.totalScore.toFixed(1)}` : '선택 전략 적용'}</span></div>
      <div className="loading-strategy-result-grid">
        <div><span>전체 적재율</span><b>{metrics.fill.toFixed(1)}%</b></div>
        <div><span>사용 / 남은 CBM</span><b>{metrics.used.toFixed(2)} / {metrics.remaining.toFixed(2)}</b></div>
        <div><span>전체 중량</span><b>{metrics.weight.toLocaleString()} kg</b></div>
        <div><span>좌우 편차</span><b>{metrics.lateral.toFixed(1)}%</b></div>
        <div><span>전후 편차</span><b>{metrics.longitudinal.toFixed(1)}%</b></div>
        <div><span>무게중심 X / Y</span><b>{metrics.cog.x.toFixed(2)} / {metrics.cog.y.toFixed(2)}m</b></div>
        <div><span>사용 박스</span><b>{metrics.boxes.toLocaleString()}개</b></div>
        <div><span>사용 파렛트</span><b>{metrics.pallets.toLocaleString()}개</b></div>
        <div className={metrics.unloaded ? 'warn' : ''}><span>미적재</span><b>{metrics.unloaded.toLocaleString()}개</b></div>
        {decision?.axleLoads && <><div><span>앞축 적재하중</span><b>{decision.axleLoads.frontKg.toFixed(0)} kg</b></div><div><span>뒤축 적재하중</span><b>{decision.axleLoads.rearKg.toFixed(0)} kg</b></div></>}
      </div>
      {decision?.requestedStrategy === 'auto' && <div className="loading-strategy-reasons">{decision.reasons.slice(0, 3).map(reason => <span key={reason}>{reason}</span>)}</div>}
    </section>, resultHost) : null;

  return <>{selector}{resultPanel}</>;
}
