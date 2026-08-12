import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { loadContainer } from './engine/loadingEngine';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

const BoxLoadingViewer = lazy(() => import('./BoxLoadingViewer'));
const PalletModePanel = lazy(() => import('./PalletModePanel'));

const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const initialCargo: CargoItem[] = [
  { id: 'BOX-A', name: 'BOX A', length: 0.6, width: 0.4, height: 0.35, weightKg: 18, quantity: 70, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true },
  { id: 'BOX-B', name: 'BOX B', length: 0.5, width: 0.35, height: 0.3, weightKg: 12, quantity: 55, maxStackLayers: 7, maxTopLoadKg: 80, allowRotation: true },
];

type CargoDraft = Omit<CargoItem, 'id'> & { id: string };
type LoadingMode = 'boxes' | 'pallets';
const emptyDraft: CargoDraft = { id: '', name: '', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true };
const STORAGE_KEY = 'container-loading-simulator-v1';
type StoredState = { container: ContainerSpec; cargo: CargoItem[] };

function readStoredState(): StoredState | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as StoredState : null; } catch { return null; }
}

function LoadingFallback() {
  return <section className="viewer"><div className="viewer-direction"><b>3D 모듈 불러오는 중</b><span>잠시 후 표시됩니다.</span></div></section>;
}

export default function App() {
  const stored = useMemo(() => readStoredState(), []);
  const [container, setContainer] = useState<ContainerSpec>(stored?.container ?? defaultContainer);
  const [cargo, setCargo] = useState<CargoItem[]>((stored?.cargo ?? initialCargo).map(item => ({ ...item, allowRotation: item.allowRotation !== false })));
  const [draft, setDraft] = useState<CargoDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<LoadingMode>('boxes');
  const [palletRunToken, setPalletRunToken] = useState(0);
  const [result, setResult] = useState<LoadingResult>(() => loadContainer(stored?.container ?? defaultContainer, (stored?.cargo ?? initialCargo).map(item => ({ ...item, allowRotation: item.allowRotation !== false }))));
  const [saveMessage, setSaveMessage] = useState('');

  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? result.usedVolumeM3 / totalVolume * 100 : 0;
  const waitingCount = useMemo(() => cargo.reduce((sum, item) => sum + item.quantity, 0), [cargo]);
  const quality = useMemo(() => assessWeightBalance(container, result), [container, result]);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result, container.length]);
  const locationRows = useMemo(() => result.placements.slice(0, 40).map((p, i) => ({ p, a: addresses[i] })), [result, addresses]);

  useEffect(() => { if (mode === 'boxes') setResult(loadContainer(container, cargo.filter(item => item.quantity > 0))); }, [container.length, container.width, container.height, container.maxPayloadKg]);

  const updateContainer = (field: keyof ContainerSpec, value: string) => setContainer(current => ({ ...current, [field]: Number(value) }));
  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => { const numeric: Array<keyof CargoDraft> = ['length','width','height','weightKg','quantity','maxStackLayers','maxTopLoadKg']; setDraft(current => ({ ...current, [field]: numeric.includes(field) ? Number(value) : value })); };
  const resetDraft = () => { setDraft(emptyDraft); setEditingId(null); };
  const saveCargo = () => { const id = draft.id.trim(); const name = draft.name.trim(); if (!id || !name || draft.length <= 0 || draft.width <= 0 || draft.height <= 0 || draft.weightKg < 0 || draft.quantity < 0) return; const next: CargoItem = { ...draft, id, name, quantity: Math.floor(draft.quantity), maxStackLayers: draft.maxStackLayers ? Math.max(1, Math.floor(draft.maxStackLayers)) : undefined, maxTopLoadKg: draft.maxTopLoadKg || undefined, allowRotation: draft.allowRotation !== false }; setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : items.some(item => item.id === next.id) ? items : [...items, next]); resetDraft(); };
  const editCargo = (item: CargoItem) => { setEditingId(item.id); setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, maxTopLoadKg: item.maxTopLoadKg ?? 0, allowRotation: item.allowRotation !== false }); };
  const deleteCargo = (id: string) => setCargo(items => items.filter(item => item.id !== id));
  const changeQuantity = (id: string, delta: number) => setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  const runLoading = () => { if (mode === 'boxes') setResult(loadContainer(container, cargo.filter(item => item.quantity > 0))); else setPalletRunToken(token => token + 1); };
  const saveLocal = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ container, cargo } satisfies StoredState)); setSaveMessage('현재 데이터가 이 브라우저에 저장되었습니다.'); };
  const loadLocal = () => { const state = readStoredState(); if (!state) return setSaveMessage('저장된 데이터가 없습니다.'); const normalized = state.cargo.map(item => ({ ...item, allowRotation: item.allowRotation !== false })); setContainer(state.container); setCargo(normalized); setResult(loadContainer(state.container, normalized.filter(item => item.quantity > 0))); setSaveMessage('저장된 데이터를 불러왔습니다.'); };
  const resetAll = () => { setContainer(defaultContainer); setCargo([]); setResult(loadContainer(defaultContainer, [])); localStorage.removeItem(STORAGE_KEY); resetDraft(); };

  return <main className="app-shell">
    <header className="topbar"><div><strong>Container Loading Simulator</strong><span>Codex release v1.1.0</span></div><div className="top-actions"><div className="loading-mode-switch"><button className={mode === 'boxes' ? 'active' : 'secondary'} onClick={() => setMode('boxes')}>박스만 적재</button><button className={mode === 'pallets' ? 'active' : 'secondary'} onClick={() => setMode('pallets')}>팔레트 사용</button></div><button className="secondary" onClick={saveLocal}>저장</button><button className="secondary" onClick={loadLocal}>불러오기</button><button onClick={runLoading}>{mode === 'boxes' ? '박스 적재 실행' : '팔레트 적재 실행'}</button></div></header>
    <section className="workspace">
      <aside className="panel left-panel">
        <h2>컨테이너 설정</h2><div className="form-grid container-form"><label>길이(m)<input type="number" value={container.length} onChange={e => updateContainer('length', e.target.value)} /></label><label>폭(m)<input type="number" value={container.width} onChange={e => updateContainer('width', e.target.value)} /></label><label>높이(m)<input type="number" value={container.height} onChange={e => updateContainer('height', e.target.value)} /></label><label>최대중량(kg)<input type="number" value={container.maxPayloadKg} onChange={e => updateContainer('maxPayloadKg', e.target.value)} /></label></div>
        <div className="form-actions"><button className="secondary" onClick={saveLocal}>현재 데이터 저장</button><button className="danger" onClick={resetAll}>전체 초기화</button></div>{saveMessage && <p className="muted">{saveMessage}</p>}
        <h2>{editingId ? '박스 수정' : '박스 등록'}</h2><div className="cargo-form"><label>코드<input value={draft.id} onChange={e => updateDraft('id', e.target.value)} disabled={Boolean(editingId)} /></label><label>이름<input value={draft.name} onChange={e => updateDraft('name', e.target.value)} /></label><div className="form-grid"><label>길이(m)<input type="number" value={draft.length} onChange={e => updateDraft('length', e.target.value)} /></label><label>폭(m)<input type="number" value={draft.width} onChange={e => updateDraft('width', e.target.value)} /></label><label>높이(m)<input type="number" value={draft.height} onChange={e => updateDraft('height', e.target.value)} /></label><label>중량(kg)<input type="number" value={draft.weightKg} onChange={e => updateDraft('weightKg', e.target.value)} /></label><label>수량<input type="number" value={draft.quantity} onChange={e => updateDraft('quantity', e.target.value)} /></label><label>최대 적층단<input type="number" value={draft.maxStackLayers ?? 1} onChange={e => updateDraft('maxStackLayers', e.target.value)} /></label><label>상부허용(kg)<input type="number" value={draft.maxTopLoadKg ?? 0} onChange={e => updateDraft('maxTopLoadKg', e.target.value)} /></label></div><label className="rotation-toggle"><input type="checkbox" checked={draft.allowRotation !== false} onChange={e => updateDraft('allowRotation', e.target.checked)} /><span>90도 회전 허용</span></label><div className="form-actions"><button onClick={saveCargo}>{editingId ? '수정 저장' : '박스 추가'}</button>{editingId && <button className="secondary" onClick={resetDraft}>취소</button>}</div></div>
        <h2>대기 화물 <span className="section-count">{waitingCount} EA</span></h2>{cargo.map(item => <article className="cargo-card" key={item.id}><div className="cargo-head"><b>{item.name}</b><span>{item.id}</span></div><span>{item.length}×{item.width}×{item.height}m · {item.weightKg}kg · 회전 {item.allowRotation === false ? '금지' : '허용'}</span><div className="quantity-row"><button className="mini" onClick={() => changeQuantity(item.id,-1)}>-</button><strong>{item.quantity} EA</strong><button className="mini" onClick={() => changeQuantity(item.id,1)}>+</button></div><div className="card-actions"><button className="secondary" onClick={() => editCargo(item)}>수정</button><button className="danger" onClick={() => deleteCargo(item.id)}>삭제</button></div></article>)}
      </aside>

      <Suspense fallback={<LoadingFallback />}>
        {mode === 'boxes' ? <BoxLoadingViewer result={result} container={container} /> : <section className="viewer pallet-viewer"><PalletModePanel container={container} cargo={cargo} runToken={palletRunToken} /></section>}
      </Suspense>

      <aside className="panel right-panel">
        {mode === 'boxes' ? <><h2>박스 적재 결과</h2><div className="metric"><span>적재 수량</span><strong>{result.placements.length}</strong></div><div className="metric"><span>회전 적재</span><strong>{result.placements.filter(p => p.rotated).length}</strong></div><div className="metric"><span>적재 중량</span><strong>{result.loadedWeightKg.toLocaleString()} kg</strong></div><div className="metric"><span>사용 CBM</span><strong>{result.usedVolumeM3.toFixed(2)} m³</strong></div><div className="metric"><span>체적 적재율</span><strong>{fillRate.toFixed(1)}%</strong></div><h2>무게중심·품질</h2><div className="quality-score"><span>종합 품질</span><strong>{quality.loadingQualityScore.toFixed(0)}점 · {quality.grade}</strong></div><div className="metric"><span>좌우 편차</span><strong>{quality.lateralDeviationPct.toFixed(1)}%</strong></div><div className="metric"><span>앞뒤 편차</span><strong>{quality.longitudinalDeviationPct.toFixed(1)}%</strong></div><h2>위치</h2><div className="location-list">{locationRows.map(({p,a},i) => <div className="location-row" key={`${p.cargoId}-${i}`}><b>{`R${a.row} C${a.column} L${a.layer}`}</b><span>{p.cargoId}</span><small>{a.zone}</small></div>)}</div><h2>미적재</h2>{result.remaining.length === 0 ? <p className="muted">없음</p> : result.remaining.map(item => <article className="warning-card" key={item.cargoId}><b>{item.cargoId} · {item.quantity} EA</b><span>{item.reason}</span></article>)}</> : <><h2>팔레트 적재 모드</h2><article className="quality-note"><b>하나의 작업 흐름으로 통합됨</b><span>왼쪽의 동일한 컨테이너·박스 데이터를 사용하며 상단 ‘팔레트 적재 실행’ 버튼으로 중앙 팔레트 결과를 다시 계산합니다.</span></article><div className="metric"><span>현재 대기 화물</span><strong>{waitingCount} EA</strong></div><div className="metric"><span>컨테이너 최대중량</span><strong>{container.maxPayloadKg.toLocaleString()} kg</strong></div></>}
      </aside>
    </section>
  </main>;
}
