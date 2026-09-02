import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhysicsTarget } from './physicsTarget';
import { useTransportEquipment } from './transportEquipment';

type Judgment = 'pass' | 'warning' | 'fail' | 'pending';
type LoadingSummary = { count: number; weightKg: number; judgment: Judgment };

const EMPTY_SUMMARY: LoadingSummary = { count: 0, weightKg: 0, judgment: 'pending' };

function parseLeadingNumber(value?: string | null) {
  const matched = (value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : 0;
}

function readBoxSummary(): LoadingSummary {
  const metrics = document.querySelectorAll<HTMLElement>('.summary-card .summary-metric-grid > div');
  const weightKg = parseLeadingNumber(metrics[1]?.querySelector('b')?.textContent);
  const count = parseLeadingNumber(metrics[2]?.querySelector('b')?.textContent);
  const resultButton = document.querySelector<HTMLElement>('.summary-card .constraint-ok');
  const judgment: Judgment = count <= 0
    ? 'pending'
    : resultButton?.classList.contains('failure')
      ? 'fail'
      : resultButton?.classList.contains('warning')
        ? 'warning'
        : 'pass';
  return { count, weightKg, judgment };
}

function judgmentLabel(judgment: Judgment) {
  if (judgment === 'pass') return '적재 가능';
  if (judgment === 'warning') return '확인 필요';
  if (judgment === 'fail') return '적재 불가';
  return '검증 전';
}

export default function HeaderLoadingStatusBoard() {
  const equipment = useTransportEquipment();
  const physicsTarget = usePhysicsTarget();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [boxSummary, setBoxSummary] = useState<LoadingSummary>(EMPTY_SUMMARY);
  const [palletVisible, setPalletVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      setPortalTarget(document.querySelector<HTMLElement>('.header-equipment-pill'));
      setPalletVisible(Boolean(document.querySelector('.pallet-viewer')));
      setBoxSummary(readBoxSummary());
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const palletSummary = useMemo<LoadingSummary | null>(() => {
    if (!palletVisible || !physicsTarget || physicsTarget.mode !== 'pallets') return null;
    const count = physicsTarget.result.placements.length;
    const weightKg = physicsTarget.result.loadedWeightKg;
    if (count <= 0) return { count, weightKg, judgment: 'pending' };
    if (weightKg > physicsTarget.container.maxPayloadKg) return { count, weightKg, judgment: 'fail' };
    const hasIssues = physicsTarget.result.remaining.length > 0 || physicsTarget.result.validationIssues.length > 0;
    return { count, weightKg, judgment: hasIssues ? 'warning' : 'pass' };
  }, [palletVisible, physicsTarget]);

  if (!portalTarget) return null;

  const summary = palletSummary ?? boxSummary;
  const typeLabel = equipment.category === 'truck' ? '트럭 종류' : '컨테이너 종류';

  return createPortal(
    <span
      className="header-loading-status-board"
      aria-label="현재 적재 현황판"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      <span className="header-loading-status-cell header-loading-status-type">
        <span className="header-loading-status-label">{typeLabel}</span>
        <b title={equipment.shortName}>{equipment.shortName}</b>
      </span>
      <span className="header-loading-status-cell">
        <span className="header-loading-status-label">적재물 갯수</span>
        <b>{summary.count.toLocaleString()} EA</b>
      </span>
      <span className="header-loading-status-cell">
        <span className="header-loading-status-label">총 무게</span>
        <b>{Math.round(summary.weightKg).toLocaleString()} kg</b>
      </span>
      <span className="header-loading-status-cell header-loading-status-result">
        <span className="header-loading-status-label">적재 판정 결과</span>
        <b className={`header-loading-status-badge ${summary.judgment}`}>{judgmentLabel(summary.judgment)}</b>
      </span>
    </span>,
    portalTarget,
  );
}
