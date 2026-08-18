import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AUTO_CORRECTION_EVENT, type AutoCorrectionEventDetail } from './correctionEvents';
import type { AutoCorrectionRecord } from './engine/types';

function positionText(point?: { x: number; y: number; z: number }) {
  if (!point) return null;
  return `X ${point.x.toFixed(2)} · Y ${point.y.toFixed(2)} · Z ${point.z.toFixed(2)}m`;
}

export default function AutoCorrectionPanel() {
  const [corrections, setCorrections] = useState<AutoCorrectionRecord[]>([]);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const resolveTarget = () => setTarget(document.querySelector('.right-panel'));
    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onCorrections = (event: Event) => {
      const detail = (event as CustomEvent<AutoCorrectionEventDetail>).detail;
      setCorrections(detail?.corrections ?? []);
    };
    window.addEventListener(AUTO_CORRECTION_EVENT, onCorrections);
    return () => window.removeEventListener(AUTO_CORRECTION_EVENT, onCorrections);
  }, []);

  if (!target) return null;

  return createPortal(<section className="auto-correction-panel">
    <h2>자동 보정 이력 <span className="section-count">{corrections.length}건</span></h2>
    {corrections.length === 0 ? <p className="muted">자동 재배치 없음</p> : <div className="auto-correction-list">
      {corrections.map((item, index) => <article key={`${item.kind}-${item.cargoId ?? 'summary'}-${index}`} className="auto-correction-card">
        <div className="auto-correction-head"><b>{item.label}</b>{item.cargoId && <span>{item.cargoId}</span>}</div>
        <p>{item.description}</p>
        {item.from && item.to && <small>{positionText(item.from)} → {positionText(item.to)}</small>}
        {item.beforeScore !== undefined && item.afterScore !== undefined && <small>보정 점수 {item.beforeScore.toFixed(2)} → {item.afterScore.toFixed(2)}</small>}
      </article>)}
    </div>}
  </section>, target);
}
