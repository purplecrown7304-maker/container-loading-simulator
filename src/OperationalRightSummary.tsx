import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

const PALLET_SNAPSHOT_EVENT = 'container-loading:pallet-snapshot-updated';

type LatestResultWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function currentTarget(): PhysicsTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  const physicsTarget = readPhysicsTarget();
  if (physicsTarget?.mode === 'pallets') return physicsTarget;
  const latest = (window as LatestResultWindow).__containerLoadingLatestResult;
  if (latest) return { mode: 'boxes', ...latest };
  return physicsTarget;
}

function shortReason(reason: string) {
  const text = reason.trim();
  if (!text) return '적재 조건 확인';
  if (/중량|payload|무게/i.test(text)) return '중량 제한';
  if (/높이|height|천장/i.test(text)) return '높이 제한';
  if (/공간|배치|fit|적재 불가|남은/i.test(text)) return '공간 부족';
  if (/상부|허용중량|stack|적층/i.test(text)) return '적층 조건';
  if (/회전|rotation/i.test(text)) return '방향 조건';
  return text.length > 22 ? `${text.slice(0, 22)}…` : text;
}

function mm(value: number) {
  return `${Math.max(0, Math.round(value * 1000)).toLocaleString()} mm`;
}

export default function OperationalRightSummary() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<PhysicsTarget | undefined>(() => currentTarget());

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));
    const refresh = () => setTarget(currentTarget());
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(PHYSICS_TARGET_EVENT, refresh);
    window.addEventListener(PALLET_SNAPSHOT_EVENT, refresh);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(PHYSICS_TARGET_EVENT, refresh);
      window.removeEventListener(PALLET_SNAPSHOT_EVENT, refresh);
    };
  }, []);

  const summary = useMemo(() => {
    if (!target) return null;
    const placements = target.result.placements;
    const top = placements.length ? Math.max(...placements.map(item => item.z + item.height)) : 0;
    const ceilingClearance = Math.max(0, target.container.height - top);
    const floor = analyzeFloorLoad(target.container, target.result, 12, 4);
    const balance = assessWeightBalance(target.container, target.result);
    const floorLimit = target.container.floorLoadLimitKgPerM2 ?? 1500;
    const cgDeviation = Math.max(balance.longitudinalDeviationPct, balance.lateralDeviationPct);
    return { ceilingClearance, floor, floorLimit, balance, cgDeviation };
  }, [target]);

  if (!host || !target) return null;

  const cargoMap = new Map(target.cargo.map(item => [item.id, item]));
  const remaining = target.result.remaining;
  const remainingCount = remaining.reduce((sum, item) => sum + item.quantity, 0);
  const floorTone = summary && summary.floor.maxKgPerM2 > summary.floorLimit ? 'danger' : 'safe';
  const cgTone = summary && summary.cgDeviation > 20 ? 'danger' : summary && summary.cgDeviation > 12 ? 'warn' : 'safe';
  const ceilingTone = summary && summary.ceilingClearance < 0.05 ? 'warn' : 'safe';

  return createPortal(
    <section className="dashboard-card operational-right-summary" aria-label="현장 적재 요약">
      <div className="operational-summary-head">
        <h2>현장 요약</h2>
        <span>{target.mode === 'pallets' ? '팔레트 적재' : '박스 적재'}</span>
      </div>

      <div className="operational-section">
        <div className="operational-section-title">
          <b>미적재 화물</b>
          <strong className={remainingCount ? 'has-remaining' : 'all-loaded'}>{remainingCount ? `${remainingCount} EA` : '없음'}</strong>
        </div>
        {remaining.length ? <div className="unplaced-list">
          {remaining.slice(0, 4).map((item, index) => <div key={`${item.cargoId}-${index}`}>
            <span><b>{item.cargoId}</b>{cargoMap.get(item.cargoId)?.name ? ` ${cargoMap.get(item.cargoId)?.name}` : ''}</span>
            <em>{item.quantity} EA</em>
            <small>{shortReason(item.reason)}</small>
          </div>)}
          {remaining.length > 4 && <p>외 {remaining.length - 4}개 품목</p>}
        </div> : <p className="all-loaded-note">등록된 적재 대상이 모두 배치되었습니다.</p>}
      </div>

      {summary && <div className="operational-section safety-compact-section">
        <div className="operational-section-title"><b>안전 여유</b><span>현재 적재안 기준</span></div>
        <div className="safety-compact-grid">
          <div className={ceilingTone}><span>천장 여유</span><b>{mm(summary.ceilingClearance)}</b></div>
          <div className={floorTone}><span>최대 바닥하중</span><b>{Math.round(summary.floor.maxKgPerM2).toLocaleString()} kg/m²</b><small>기준 {summary.floorLimit.toLocaleString()}</small></div>
          <div className={cgTone}><span>무게중심 편차</span><b>{summary.cgDeviation.toFixed(1)}%</b><small>앞뒤 {summary.balance.longitudinalDeviationPct.toFixed(1)} · 좌우 {summary.balance.lateralDeviationPct.toFixed(1)}</small></div>
        </div>
      </div>}
    </section>,
    host,
  );
}
