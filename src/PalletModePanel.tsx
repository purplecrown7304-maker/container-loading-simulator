import { useMemo, useState } from 'react';
import { defaultPalletSpec, packOnPallets, type PalletPackingResult, type PalletSpec } from './engine/palletPacking';
import type { CargoItem, ContainerSpec } from './engine/types';

const STORAGE_KEY = 'container-loading-simulator-v1';
type StoredState = { container: ContainerSpec; cargo: CargoItem[] };

function readStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredState : null;
  } catch {
    return null;
  }
}

export default function PalletModePanel() {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<PalletSpec>(defaultPalletSpec);
  const [result, setResult] = useState<PalletPackingResult | null>(null);
  const [message, setMessage] = useState('');

  const summary = useMemo(() => {
    if (!result) return [];
    return result.pallets.map((p) => ({
      index: p.palletIndex,
      boxes: p.cargoPlacements.length,
      cargoWeight: p.cargoWeightKg,
      totalWeight: p.totalWeightKg,
      cargoIds: [...new Set(p.cargoPlacements.map((x) => x.cargoId))].join(', '),
    }));
  }, [result]);

  const run = () => {
    const state = readStored();
    if (!state) {
      setMessage('먼저 메인 화면에서 현재 데이터를 저장하세요.');
      setResult(null);
      return;
    }
    const next = packOnPallets(state.container, state.cargo, spec);
    setResult(next);
    setMessage(`팔레트 ${next.palletCount}개 · 화물 ${next.placements.length}EA 계산 완료`);
  };

  return (
    <div className="pallet-mode-widget">
      <button className="pallet-mode-trigger" onClick={() => setOpen((v) => !v)}>팔레트 모드</button>
      {open && (
        <section className="pallet-mode-panel">
          <div className="pallet-panel-head"><div><b>팔레트 적재</b><span>저장된 현재 화물 기준</span></div><button className="secondary" onClick={() => setOpen(false)}>닫기</button></div>
          <div className="pallet-spec-grid">
            <label>길이(m)<input type="number" step="0.01" value={spec.length} onChange={(e) => setSpec({ ...spec, length: Number(e.target.value) })} /></label>
            <label>폭(m)<input type="number" step="0.01" value={spec.width} onChange={(e) => setSpec({ ...spec, width: Number(e.target.value) })} /></label>
            <label>높이(m)<input type="number" step="0.01" value={spec.height} onChange={(e) => setSpec({ ...spec, height: Number(e.target.value) })} /></label>
            <label>팔레트 중량(kg)<input type="number" value={spec.tareWeightKg} onChange={(e) => setSpec({ ...spec, tareWeightKg: Number(e.target.value) })} /></label>
            <label>최대 적재중량(kg)<input type="number" value={spec.maxLoadKg} onChange={(e) => setSpec({ ...spec, maxLoadKg: Number(e.target.value) })} /></label>
          </div>
          <button className="pallet-run" onClick={run}>팔레트 적재 계산</button>
          {message && <p className="muted">{message}</p>}
          {result && <>
            <div className="pallet-metrics">
              <div><span>사용 팔레트</span><strong>{result.palletCount}</strong></div>
              <div><span>적재 화물</span><strong>{result.placements.length} EA</strong></div>
              <div><span>화물 중량</span><strong>{result.loadedCargoWeightKg.toLocaleString()} kg</strong></div>
              <div><span>팔레트 포함</span><strong>{result.totalPalletizedWeightKg.toLocaleString()} kg</strong></div>
            </div>
            <div className="pallet-list">
              {summary.map((p) => <article key={p.index}><b>P{p.index}</b><span>{p.boxes} EA · 화물 {p.cargoWeight.toLocaleString()}kg · 총 {p.totalWeight.toLocaleString()}kg</span><small>{p.cargoIds}</small></article>)}
            </div>
            {result.remaining.length > 0 && <div className="pallet-remaining"><b>미적재</b>{result.remaining.map((r) => <span key={r.cargoId}>{r.cargoId} {r.quantity}EA · {r.reason}</span>)}</div>}
          </>}
        </section>
      )}
    </div>
  );
}
