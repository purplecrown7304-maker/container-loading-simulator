import { useEffect, useState } from 'react';
import OperationProgressOverlay from './OperationProgressOverlay';
import { AUTOMATIC_LOADING_PROGRESS_EVENT, type AutomaticLoadingProgressDetail } from './engine/physicsOptimizer';
import {
  LOADING_STRATEGY_SELECTION_EVENT,
  readUserLoadingStrategy,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';

const STRATEGY_LABEL: Record<UserLoadingStrategy, string> = {
  auto: '균형 최적화형',
  capacity: '공간 활용 우선형',
  balance: '무게 중심형 적재',
  safety: '안정성 우선형',
  unloading: '작업 편의 우선형',
  grouping: '동일 제품 묶음 적재',
};

export default function AutomaticLoadingProgressOverlay() {
  const [detail, setDetail] = useState<AutomaticLoadingProgressDetail | null>(null);
  const [strategy, setStrategy] = useState<UserLoadingStrategy>(() => readUserLoadingStrategy());

  useEffect(() => {
    let clearTimer = 0;
    const onProgress = (event: Event) => {
      const next = (event as CustomEvent<AutomaticLoadingProgressDetail>).detail;
      window.clearTimeout(clearTimer);
      if (!next || next.status === 'error') {
        setDetail(null);
        return;
      }
      if (next.status === 'done') {
        setDetail(next);
        clearTimer = window.setTimeout(() => setDetail(null), 180);
        return;
      }
      setDetail(next);
    };
    const onStrategy = (event: Event) => {
      setStrategy((event as CustomEvent<UserLoadingStrategy>).detail ?? readUserLoadingStrategy());
    };
    window.addEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
    };
  }, []);

  if (!detail) return null;
  return <OperationProgressOverlay title={`자동 적재 중 · ${STRATEGY_LABEL[strategy]}`} progress={detail.progress} startedAt={detail.startedAt} stage={detail.stage} />;
}
