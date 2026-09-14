import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import OperationProgressOverlay from './OperationProgressOverlay';
import { AUTOMATIC_LOADING_PROGRESS_EVENT, type AutomaticLoadingProgressDetail } from './engine/physicsOptimizer';
import {
  LOADING_STRATEGY_DECISION_EVENT,
  LOADING_STRATEGY_SELECTION_EVENT,
  readStrategyDecision,
  readUserLoadingStrategy,
  type StrategyDecision,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';
import {
  GUIDED_LOADING_UNIT_EVENT,
  readGuidedLoadingUnit,
  type GuidedLoadingUnit,
} from './guidedLoadingUnit';

const STRATEGY_LABEL: Record<UserLoadingStrategy, string> = {
  auto: '균형 최적화형',
  capacity: '공간 활용 우선형',
  balance: '무게 중심형 적재',
  safety: '안정성 우선형',
  unloading: '작업 편의 우선형',
  grouping: '동일 제품 묶음 적재',
};

const UNIT_LABEL: Record<GuidedLoadingUnit, string> = {
  boxes: '상자 적재',
  pallets: '파렛트 적재',
};

export default function AutomaticLoadingProgressOverlay() {
  const [detail, setDetail] = useState<AutomaticLoadingProgressDetail | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [strategy, setStrategy] = useState<UserLoadingStrategy>(() => readUserLoadingStrategy());
  const [unit, setUnit] = useState<GuidedLoadingUnit>(() => readGuidedLoadingUnit());
  const [decision, setDecision] = useState<StrategyDecision | undefined>(() => readStrategyDecision());
  const [viewerHost, setViewerHost] = useState<HTMLElement | null>(null);
  const [guidedStep, setGuidedStep] = useState(() => Number(document.documentElement.dataset.guidedStep || 0));

  useEffect(() => {
    let clearTimer = 0;
    const onProgress = (event: Event) => {
      const next = (event as CustomEvent<AutomaticLoadingProgressDetail>).detail;
      window.clearTimeout(clearTimer);
      if (!next) return;
      if (next.status === 'error') {
        setStatus('error');
        setDetail(null);
        return;
      }
      if (next.status === 'done') {
        setStatus('done');
        setDetail(next);
        clearTimer = window.setTimeout(() => setDetail(null), 180);
        return;
      }
      setStatus('running');
      setDetail(next);
    };
    const onStrategy = (event: Event) => {
      setStrategy((event as CustomEvent<UserLoadingStrategy>).detail ?? readUserLoadingStrategy());
      setDecision(undefined);
      setStatus('idle');
    };
    const onUnit = (event: Event) => {
      setUnit((event as CustomEvent<GuidedLoadingUnit>).detail ?? readGuidedLoadingUnit());
      setStatus('idle');
    };
    const onDecision = (event: Event) => {
      setDecision((event as CustomEvent<StrategyDecision>).detail ?? readStrategyDecision());
    };
    window.addEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
    window.addEventListener(GUIDED_LOADING_UNIT_EVENT, onUnit);
    window.addEventListener(LOADING_STRATEGY_DECISION_EVENT, onDecision);
    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
      window.removeEventListener(GUIDED_LOADING_UNIT_EVENT, onUnit);
      window.removeEventListener(LOADING_STRATEGY_DECISION_EVENT, onDecision);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setGuidedStep(Number(document.documentElement.dataset.guidedStep || 0));
        const host = document.querySelector<HTMLElement>('.viewer-host');
        setViewerHost(current => current === host ? current : host);
        const runStrategy = document.documentElement.dataset.guidedRunStrategy as UserLoadingStrategy | undefined;
        const runUnit = document.documentElement.dataset.guidedRunUnit as GuidedLoadingUnit | undefined;
        if (runStrategy && runStrategy in STRATEGY_LABEL) setStrategy(runStrategy);
        if (runUnit === 'boxes' || runUnit === 'pallets') setUnit(runUnit);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step', 'data-guided-run-strategy', 'data-guided-run-unit'] });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const executionLabel = useMemo(() => {
    if (!decision) return STRATEGY_LABEL[strategy];
    if (decision.requestedStrategy === 'auto') return `${STRATEGY_LABEL.auto} · 실제 배치 ${STRATEGY_LABEL[decision.selectedStrategy]}`;
    return STRATEGY_LABEL[decision.requestedStrategy];
  }, [decision, strategy]);

  const statusLabel = status === 'running' ? '계산 중'
    : status === 'done' ? '배치 완료'
      : status === 'error' ? '계산 오류'
        : '실행 대기';

  const persistent = guidedStep === 5 && viewerHost ? createPortal(
    <div
      aria-label="자동 적재 선택 상태"
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 11px',
        borderRadius: 10,
        background: 'rgba(255,255,255,.94)',
        border: '1px solid rgba(15,98,254,.2)',
        boxShadow: '0 5px 18px rgba(31,41,55,.1)',
        pointerEvents: 'none',
        fontSize: 12,
      }}
    >
      <b style={{ color: '#0f62fe' }}>{UNIT_LABEL[unit]}</b>
      <span>·</span>
      <b>{executionLabel}</b>
      <span style={{ color: status === 'error' ? '#b91c1c' : status === 'done' ? '#166534' : '#64748b' }}>{statusLabel}</span>
    </div>,
    viewerHost,
  ) : null;

  return <>
    {detail && <OperationProgressOverlay
      title={`자동 적재 중 · ${UNIT_LABEL[unit]} · ${STRATEGY_LABEL[strategy]}`}
      progress={detail.progress}
      startedAt={detail.startedAt}
      stage={detail.stage}
    />}
    {persistent}
  </>;
}
