import { useEffect, useState } from 'react';
import OperationProgressOverlay from './OperationProgressOverlay';
import { AUTOMATIC_LOADING_PROGRESS_EVENT, type AutomaticLoadingProgressDetail } from './engine/physicsOptimizer';

export default function AutomaticLoadingProgressOverlay() {
  const [detail, setDetail] = useState<AutomaticLoadingProgressDetail | null>(null);

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
    window.addEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    };
  }, []);

  if (!detail) return null;
  return <OperationProgressOverlay title="자동 적재 중" progress={detail.progress} startedAt={detail.startedAt} stage={detail.stage} />;
}
