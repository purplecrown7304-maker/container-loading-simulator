import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { recommendSpareCapacity } from './engine/spareCapacity';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { writeStoredState } from './storage';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };

export default function SpareCapacityPanel() {
  const [target, setTarget] = useState<Element | null>(null);
  const [detail, setDetail] = useState<LoadingDetail | null>(() =>
    typeof window === 'undefined' ? null : ((window as LoadingWindow).__containerLoadingLatestResult ?? null),
  );

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

  const recommendations = useMemo(() => {
    if (!detail || detail.result.placements.length === 0) return [];
    return recommendSpareCapacity(detail.container, detail.cargo, detail.result, 6);
  }, [detail]);

  if (!target || !detail) return null;
  const totalVolume = Math.max(detail.container.length * detail.container.width * detail.container.height, 1e-9);
  const remainingCount = detail.result.remaining.reduce((sum, item) => sum + item.quantity, 0);

  const applyRecommendation = (cargoId: string, quantity: number) => {
    const cargo = detail.cargo.map(item => item.id === cargoId ? { ...item, quantity: item.quantity + quantity } : item);
    writeStoredState({ container: detail.container, cargo }, true);
  };

  return createPortal(<section className="dashboard-card spare-capacity-panel">
    <div className="card-heading-row"><h2>12. 빈 공간 추가 적재 추천</h2><span>{recommendations.length}개 후보</span></div>
    <p className="spare-help">현재 배치를 고정한 상태에서 실제 충돌·지지·적층·상부하중·중량 제한을 다시 검사해 추가 가능 수량을 계산합니다.</p>
    {remainingCount > 0 && <div className="spare-warning">현재 미적재 화물 {remainingCount}EA가 있습니다. 추가 출하보다 기존 미적재 해결이 우선입니다.</div>}
    {recommendations.length === 0 ? <div className="spare-empty">등록된 품목 중 현재 빈 공간에 안전하게 추가할 수 있는 후보를 찾지 못했습니다.</div> : <div className="spare-list">
      {recommendations.map((item, index) => {
        const projectedFill = item.projectedUsedVolumeM3 / totalVolume * 100;
        return <article key={item.cargoId} className="spare-card">
          <div className="spare-card-head"><div><em>{index + 1}</em><span><b>{item.cargoId}</b><small>{item.name}</small></span></div><strong>+{item.additionalQuantity} EA</strong></div>
          <div className="spare-metrics">
            <span>추가 부피 <b>{item.additionalVolumeM3.toFixed(2)} m³</b></span>
            <span>추가 중량 <b>{item.additionalWeightKg.toLocaleString()} kg</b></span>
            <span>예상 적재율 <b>{projectedFill.toFixed(1)}%</b></span>
            <span>배치 구역 <b>{item.zones.join(' · ') || '-'}</b></span>
          </div>
          {item.firstPlacement && <small className="spare-position">첫 추가 위치 X {item.firstPlacement.x.toFixed(2)} · Y {item.firstPlacement.y.toFixed(2)} · Z {item.firstPlacement.z.toFixed(2)}m</small>}
          <p>{item.stopReason}</p>
          <button type="button" onClick={() => applyRecommendation(item.cargoId, item.additionalQuantity)}>추천 수량을 화물에 반영</button>
        </article>;
      })}
    </div>}
    <div className="spare-disclaimer">※ 추천 수량은 현재 등록된 품목 규격을 기준으로 한 시뮬레이션입니다. 실제 출하 추가 결정 전 현장 안전조건을 다시 확인하세요.</div>
  </section>, target);
}
