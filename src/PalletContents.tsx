import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { uiText, uiMessage, useUiLanguage } from './uiLanguage';
import LoadingViewer from './LoadingViewer';
import type { PalletLoad } from './engine/palletOptimization';
import type { CargoItem } from './engine/types';
import { palletModelKey } from './palletModel';
import { cargoColor } from './cargoColors';
import { cargoStackRestrictions } from './cargoStackRestrictions';
import { StagingSceneContext } from './stagingSceneContext';

export function PalletMiniPreview({ pallet, modelKey }: { pallet: PalletLoad; modelKey: ReturnType<typeof palletModelKey> }) {
  useUiLanguage();
  const scene = useMemo(() => {
    const placements = pallet.cargoPlacements.map(box => ({ ...box, x: box.x - pallet.x, y: box.y - pallet.y, z: box.z - pallet.z }));
    return {
      container: { length: pallet.length, width: pallet.width, height: Math.max(pallet.height, ...placements.map(box => box.z + box.height)), maxPayloadKg: pallet.totalWeightKg },
      result: { placements, remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: pallet.cargoWeightKg },
      supports: [{ modelKey, id: `PALLET-${pallet.palletIndex}`, x: 0, y: 0, z: 0, length: pallet.length, width: pallet.width, height: pallet.height, weightKg: pallet.totalWeightKg - pallet.cargoWeightKg }],
    };
  }, [pallet, modelKey]);
  return <div className="pallet-mini-canvas"><StagingSceneContext.Provider value={null}>
    <LoadingViewer {...scene} geometry="platform" preview compact syncSelection={false} showCg={false} title={uiText("팔레트 {0} 상세", [pallet.palletIndex])} />
  </StagingSceneContext.Provider></div>;
}

export default function PalletContents({ pallet, cargo, onClose, modelKey }: { pallet: PalletLoad; cargo: CargoItem[]; onClose: () => void; modelKey: ReturnType<typeof palletModelKey> }) {
  useUiLanguage();
  const titleId = useId(), dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.querySelector<HTMLButtonElement>('header button')?.focus({ preventScroll: true });
    return () => {
      if (node?.contains(document.activeElement) && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close.current();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    pallet.cargoPlacements.forEach((box) => map.set(box.cargoId, (map.get(box.cargoId) ?? 0) + 1));
    return [...map.entries()];
  }, [pallet]);
  const maxTop = Math.max(pallet.z, ...pallet.cargoPlacements.map((box) => box.z + box.height));
  const restrictions = cargoStackRestrictions(groups.flatMap(([id, quantity]) => {
    const item = cargo.find(candidate => candidate.id === id);
    return item ? [{ ...item, quantity }] : [];
  }));

  return (
    <div ref={dialog} className="pallet-content-popover" role="dialog" aria-labelledby={titleId} data-view-only="true" onContextMenu={(event) => event.preventDefault()}>
      <header>
        <div>
          <b id={titleId}>{uiText("AUTO-PALLET-{0} 적재 정보", [String(pallet.palletIndex).padStart(2, '0')])}</b>
          <small>{uiText("{0}열 · {1}단", [pallet.stackColumn, pallet.stackLevel])}</small>
        </div>
        <button type="button" aria-label={uiText('닫기')} onClick={onClose}>×</button>
      </header>
      <div className="pallet-content-metrics">
        <div><span>{uiText("총 적재수량")}</span><strong>{pallet.cargoPlacements.length} EA</strong></div>
        <div><span>{uiText("총중량")}</span><strong>{pallet.totalWeightKg.toFixed(0)} kg</strong></div>
        <div><span>{uiText("팔레트 규격")}</span><strong>{Math.round(pallet.length * 1000)}×{Math.round(pallet.width * 1000)}</strong></div>
        <div><span>{uiText("적재 높이")}</span><strong>{Math.round((maxTop - pallet.z) * 1000)} mm</strong></div>
      </div>
      <PalletMiniPreview pallet={pallet} modelKey={modelKey} />
      {restrictions.length > 0 && <section aria-label={uiText("이 팔레트의 박스 적층 제한")}>
        <h4>{uiText("위로 더 쌓을 수 없는 박스")}</h4>
        {restrictions.map((entry, index) => <p key={index}><b>{entry.name}</b><br />{entry.limits.split(' · ').map(part => uiMessage(part)).join(' · ')}<br /><small>{uiMessage(entry.reason)}</small></p>)}
        <p>{uiText("현재 적용된 제한입니다. 박스 관리에서 실제 허용하중·최대 적층단을 확인한 뒤 포장 확정과 자동 적재를 다시 실행하세요.")}</p>
      </section>}
      <h4>{uiText("팔레트 속 내용")}</h4>
      <div className="pallet-content-list">
        {groups.map(([id, count]) => {
          const item = cargo.find((candidate) => candidate.id === id);
          return (
            <article key={id}>
              <i style={{ background: cargoColor(id) }} />
              <div>
                <b>{id} {item?.name ?? ''}</b>
                <small>{item ? `${Math.round(item.length * 1000)}×${Math.round(item.width * 1000)}×${Math.round(item.height * 1000)} mm · ${item.weightKg}kg` : ''}</small>
              </div>
              <strong>{count} EA</strong>
            </article>
          );
        })}
      </div>
      <div className="pallet-content-foot">
        <span>{uiText("화물중량 {0}kg", [pallet.cargoWeightKg.toFixed(0)])}</span>
        <span>{uiText("팔레트/포장 {0}kg", [Math.max(0, pallet.totalWeightKg - pallet.cargoWeightKg).toFixed(1)])}</span>
      </div>
    </div>
  );
}
