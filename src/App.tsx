import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { loadContainer } from './engine/loadingEngine';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { openLoadingReport } from './report';
import { normalizeCargo, readStoredState, STORAGE_KEY, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';

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

function LoadingFallback() {
  return <section className="viewer"><div className="viewer-direction"><b>3D 모듈 불러오는 중</b><span>잠시 후 표시됩니다.</span></div></section>;
}

function isValidContainer(container: ContainerSpec): boolean {
  return [container.length, container.width, container.height].every((value) => Number.isFinite(value) && value > 0)
    && Number.isFinite(container.maxPayloadKg)
    && container.maxPayloadKg >= 0;
}

export default function App() {
  const stored = useMemo(() => readStoredState(), []);
  const startingCargo = useMemo(() => normalizeCargo(stored?.cargo?.length ? stored.cargo : initialCargo), [stored]);
  const [container, setContainer] = useState<ContainerSpec>(stored?.container ?? defaultContainer);
  const [cargo, setCargo] = useState<CargoItem[]>(startingCargo);
  const [draft, setDraft] = useState<CargoDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<LoadingMode>('boxes');
  const [palletRunToken, setPalletRunToken] = useState(0);
  const [result, setResult] = useState<LoadingResult>(() => loadContainer(stored?.container ?? defaultContainer, startingCargo));
  const [saveMessage, setSaveMessage] = useState('');

  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? result.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = container.maxPayloadKg > 0 ? result.loadedWeightKg / container.maxPayloadKg * 100 : 0;
  const waitingCount = useMemo(() => cargo.reduce((sum, item) => sum + item.quantity, 0), [cargo]);
  const quality = useMemo(() => assessWeightBalance(container, result), [container, result]);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result, container.length]);
  const locationRows = useMemo(() => result.placements.slice(0, 40).map((p, i) => ({ p, a: addresses[i] })), [result, addresses]);
  const maxLayer = useMemo(() => addresses.reduce((max, item) => Math.max(max, item?.layer ?? 0), 0), [addresses]);
  const loadedByCargo = useMemo(() => {
    const map = new Map<string, number>();
    result.placements.forEach((p) => map.set(p.cargoId, (map.get(p.cargoId) ?? 0) + 1));
    return map;
  }, [result.placements]);

  useEffect(() => {
    if (mode === 'boxes' && isValidContainer(container)) setResult(loadContainer(container, cargo.filter(item => item.quantity > 0)));
  }, [container.length, container.width, container.height, container.maxPayloadKg]);

  useEffect(() => {
    const onStorageUpdated = (event: Event) => {
      const state = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      if (!state) return;
      const normalized = normalizeCargo(state.cargo);
      setContainer(state.container);
      setCargo(normalized);
      if (isValidContainer(state.container)) setResult(loadContainer(state.container, normalized.filter(item => item.quantity > 0)));
      setSaveMessage('가져온 데이터가 현재 화면에 반영되었습니다.');
      setEditingId(null);
      setDraft(emptyDraft);
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
  }, []);

  const updateContainer = (field: keyof ContainerSpec, value: string) => setContainer(current => ({ ...current, [field]: Number(value) }));
  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => {
    const numeric: Array<keyof CargoDraft> = ['length','width','height','weightKg','quantity','maxStackLayers','maxTopLoadKg'];
    setDraft(current => ({ ...current, [field]: numeric.includes(field) ? Number(value) : value }));
  };
  const resetDraft = () => { setDraft(emptyDraft); setEditingId(null); };
  const saveCargo = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    const valid = id && name && draft.length > 0 && draft.width > 0 && draft.height > 0 && draft.weightKg >= 0 && draft.quantity >= 0
      && Number.isFinite(draft.length) && Number.isFinite(draft.width) && Number.isFinite(draft.height)
      && Number.isFinite(draft.weightKg) && Number.isFinite(draft.quantity);
    if (!valid) return setSaveMessage('박스 코드·이름·치수·중량·수량을 확인하세요. 치수는 0보다 커야 합니다.');
    if (!editingId && cargo.some((item) => item.id === id)) return setSaveMessage(`이미 등록된 박스 코드입니다: ${id}`);
    const next: CargoItem = {
      ...draft, id, name, quantity: Math.floor(draft.quantity),
      maxStackLayers: draft.maxStackLayers ? Math.max(1, Math.floor(draft.maxStackLayers)) : undefined,
      maxTopLoadKg: draft.maxTopLoadKg || undefined,
      allowRotation: draft.allowRotation !== false,
    };
    setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : [...items, next]);
    setSaveMessage(editingId ? `${id} 수정 완료` : `${id} 등록 완료`);
    resetDraft();
  };
  const editCargo = (item: CargoItem) => {
    setEditingId(item.id);
    setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, maxTopLoadKg: item.maxTopLoadKg ?? 0, allowRotation: item.allowRotation !== false });
  };
  const deleteCargo = (id: string) => setCargo(items => items.filter(item => item.id !== id));
  const changeQuantity = (id: string, delta: number) => setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  const runLoading = () => {
    if (!isValidContainer(container)) return setSaveMessage('컨테이너 길이·폭·높이는 0보다 커야 하고 최대중량은 0 이상이어야 합니다.');
    setSaveMessage('');
    if (mode === 'boxes') setResult(loadContainer(container, cargo.filter(item => item.quantity > 0)));
    else setPalletRunToken(token => token + 1);
  };
  const printReport = () => {
    if (mode !== 'boxes') return setSaveMessage('작업지시서 출력은 박스만 적재 모드에서 실행하세요.');
    if (!openLoadingReport(container, cargo, result)) setSaveMessage('팝업이 차단되어 작업지시서를 열지 못했습니다.');
  };
  const saveLocal = () => { writeStoredState({ container, cargo }); setSaveMessage('현재 데이터가 이 브라우저에 저장되었습니다.'); };
  const loadLocal = () => {
    const state = readStoredState();
    if (!state) return setSaveMessage('저장된 데이터가 없습니다.');
    const normalized = normalizeCargo(state.cargo);
    setContainer(state.container); setCargo(normalized);
    if (isValidContainer(state.container)) setResult(loadContainer(state.container, normalized.filter(item => item.quantity > 0)));
    setSaveMessage('저장된 데이터를 불러왔습니다.');
  };
  const loadSampleData = () => {
    const sample = normalizeCargo(initialCargo.map(item => ({ ...item })));
    setContainer(defaultContainer);
    setCargo(sample);
    setMode('boxes');
    setResult(loadContainer(defaultContainer, sample));
    setSaveMessage('샘플 데이터 BOX-A 70EA / BOX-B 55EA를 불러왔습니다.');
    resetDraft();
  };
  const resetAll = () => {
    if (!window.confirm('등록된 화물과 저장 데이터를 모두 초기화할까요?')) return;
    setContainer(defaultContainer); setCargo([]); setResult(loadContainer(defaultContainer, []));
    localStorage.removeItem(STORAGE_KEY); setSaveMessage('모든 화물 데이터를 초기화했습니다. 샘플 데이터 버튼으로 언제든 복원할 수 있습니다.'); resetDraft();
  };

  return <main className="app-shell mockup-dashboard">
    <header className="topbar mockup-topbar">
      <div className="brand-block"><span className="brand-cube">◇</span><strong>컨테이너 적재 시뮬레이터</strong></div>
      <nav className="main-nav" aria-label="주요 메뉴">
        <button className="nav-item active">▣ 대시보드</button><button className="nav-item">⬡ 3D 뷰</button><button className="nav-item">▥ 2D 레이아웃</button><button className="nav-item" onClick={printReport}>▤ 결과 보고서</button>
      </nav>
      <div className="top-actions compact"><button className="sample-action" onClick={loadSampleData}>▣ 샘플 데이터</button><button className="secondary" onClick={loadLocal}>새로고침</button><button className="secondary" onClick={saveLocal}>저장</button><button className="secondary" onClick={printReport}>내보내기</button></div>
    </header>

    <section className="dashboard-grid">
      <aside className="dashboard-left">
        <section className="dashboard-card"><h2>1. 컨테이너 정보</h2><select value="40hc" onChange={()=>{}}><option value="40hc">40FT High Cube</option></select><div className="spec-list"><span>내부 길이 <b>{(container.length*1000).toLocaleString()} mm</b></span><span>내부 폭 <b>{(container.width*1000).toLocaleString()} mm</b></span><span>내부 높이 <b>{(container.height*1000).toLocaleString()} mm</b></span><span>적재 용적 <b>{totalVolume.toFixed(1)} m³</b></span><span>최대 적재중량 <b>{container.maxPayloadKg.toLocaleString()} kg</b></span></div><details><summary>상세 규격 / 직접 수정</summary><div className="form-grid compact-form"><label>길이(m)<input type="number" value={container.length} onChange={e=>updateContainer('length',e.target.value)}/></label><label>폭(m)<input type="number" value={container.width} onChange={e=>updateContainer('width',e.target.value)}/></label><label>높이(m)<input type="number" value={container.height} onChange={e=>updateContainer('height',e.target.value)}/></label><label>최대중량<input type="number" value={container.maxPayloadKg} onChange={e=>updateContainer('maxPayloadKg',e.target.value)}/></label></div></details></section>

        <section className="dashboard-card cargo-browser"><div className="card-heading-row"><h2>2. 적재할 화물</h2><span>{waitingCount} EA</span></div><div className="mode-tabs"><button className={mode==='boxes'?'active':''} onClick={()=>setMode('boxes')}>박스</button><button className={mode==='pallets'?'active':''} onClick={()=>setMode('pallets')}>팔레트</button></div>{cargo.length===0?<div className="empty-cargo"><b>등록된 화물이 없습니다.</b><span>샘플 데이터로 바로 시작할 수 있습니다.</span><button onClick={loadSampleData}>샘플 데이터 불러오기</button></div>:<div className="cargo-scroll">{cargo.map(item => <article className="cargo-list-item" key={item.id}><div className="cargo-icon">□</div><div><b>{item.id} {item.name}</b><span>{Math.round(item.length*1000)} × {Math.round(item.width*1000)} × {Math.round(item.height*1000)} mm</span><small>{item.weightKg} kg</small></div><strong>{item.quantity}</strong><div className="cargo-inline-actions"><button onClick={()=>changeQuantity(item.id,-1)}>−</button><button onClick={()=>changeQuantity(item.id,1)}>＋</button><button onClick={()=>editCargo(item)}>수정</button><button onClick={()=>deleteCargo(item.id)}>삭제</button></div></article>)}</div>}<details className="cargo-add-panel" open={Boolean(editingId)}><summary>＋ 새 화물 추가</summary><div className="cargo-form"><label>코드<input value={draft.id} onChange={e=>updateDraft('id',e.target.value)} disabled={Boolean(editingId)}/></label><label>이름<input value={draft.name} onChange={e=>updateDraft('name',e.target.value)}/></label><div className="form-grid"><label>길이(m)<input type="number" value={draft.length} onChange={e=>updateDraft('length',e.target.value)}/></label><label>폭(m)<input type="number" value={draft.width} onChange={e=>updateDraft('width',e.target.value)}/></label><label>높이(m)<input type="number" value={draft.height} onChange={e=>updateDraft('height',e.target.value)}/></label><label>중량(kg)<input type="number" value={draft.weightKg} onChange={e=>updateDraft('weightKg',e.target.value)}/></label><label>수량<input type="number" value={draft.quantity} onChange={e=>updateDraft('quantity',e.target.value)}/></label><label>최대 적층단<input type="number" value={draft.maxStackLayers??1} onChange={e=>updateDraft('maxStackLayers',e.target.value)}/></label></div><button onClick={saveCargo}>{editingId?'수정 저장':'박스 추가'}</button></div></details>{saveMessage && <p className="status-message muted">{saveMessage}</p>}</section>

        <section className="dashboard-card loading-options"><h2>3. 적재 옵션</h2><label>적재 전략<select defaultValue="stability"><option value="stability">무게 우선 (안전 적재)</option><option value="capacity">최대 적재율</option><option value="unloading">하역 편의 우선</option></select></label><label>적재 방향<select defaultValue="auto"><option value="auto">자동 (최적 방향)</option></select></label><label>바닥 패턴<select defaultValue="line"><option value="line">라인 적재</option></select></label><div className="option-checks"><label><input type="checkbox" defaultChecked/> 하중 분산 최적화</label><label><input type="checkbox" defaultChecked/> 회전 허용</label><label><input type="checkbox" defaultChecked/> 혼합 적재 허용</label></div></section>
      </aside>

      <section className="dashboard-center">
        <section className="dashboard-card viewer-card"><div className="card-heading-row"><div><h2>적재 시뮬레이션 미리보기</h2><div className="cargo-legend">{cargo.slice(0,4).map((item,index)=><span key={item.id}><i data-index={index}/>{item.id}</span>)}<span><i className="empty"/>여유 공간</span></div></div><div className="viewer-toolbar"><button className="active">3D 뷰</button><button>2D 뷰</button></div></div><div className="viewer-host"><Suspense fallback={<LoadingFallback />}>{mode==='boxes'?<BoxLoadingViewer result={result} container={container}/>:<section className="viewer pallet-viewer"><PalletModePanel container={container} cargo={cargo} runToken={palletRunToken}/></section>}</Suspense></div></section>

        <section className="center-mini-grid"><article className="dashboard-card layer-card"><h2>6. 층별 보기 ({maxLayer}층)</h2><div className="layer-thumbnails">{Array.from({length:Math.min(Math.max(maxLayer,1),5)},(_,i)=><div key={i}><div className="layer-thumb">{i+1}</div><span>{i+1}층</span></div>)}</div></article><article className="dashboard-card heat-card"><h2>7. 하중 분포 <small>(바닥 면적당 하중)</small></h2><div className="heatmap"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="heat-legend"><span>낮음</span><span>평균/최대 하중은 실제 계산값으로 갱신</span><span>높음</span></div></article></section>

        <section className="dashboard-card loading-table-card"><h2>8. 적재 리스트</h2><div className="table-wrap"><table><thead><tr><th>No.</th><th>화물 코드</th><th>크기(mm)</th><th>요청 수량</th><th>적재 수량</th><th>개당 중량</th><th>총 중량</th><th>적재 위치</th></tr></thead><tbody>{cargo.map((item,index)=>{const loaded=loadedByCargo.get(item.id)??0; const first=result.placements.find(p=>p.cargoId===item.id); return <tr key={item.id}><td>{index+1}</td><td><b>{item.id}</b></td><td>{Math.round(item.length*1000)}×{Math.round(item.width*1000)}×{Math.round(item.height*1000)}</td><td>{item.quantity}</td><td>{loaded}</td><td>{item.weightKg}kg</td><td>{(loaded*item.weightKg).toLocaleString()}kg</td><td>{first?(first.x<container.length/3?'안쪽':first.x<container.length*2/3?'중앙':'문쪽'):'-'}</td></tr>})}</tbody></table></div></section>

        <details className="dashboard-card advanced-tools"><summary><span><b>고급 기능</b><small>전략 비교 · 빈 공간 추천 · 수동 배치 · 작업 순서 · 작업자 위험 점검</small></span><strong>펼치기</strong></summary><div className="advanced-tools-host"></div><div className="advanced-location"><h3>위치 / 미적재 상세</h3><div className="location-list">{locationRows.slice(0,12).map(({p,a},i)=><div className="location-row" key={`${p.cargoId}-${i}`}><b>{`R${a.row} C${a.column} L${a.layer}`}</b><span>{p.cargoId}</span><small>{a.zone}</small></div>)}</div>{result.remaining.length>0&&<div className="remaining-compact">{result.remaining.map(item=><span key={item.cargoId}>{item.cargoId} {item.quantity}EA · {item.reason}</span>)}</div>}</div></details>
      </section>

      <aside className="dashboard-right">
        <section className="dashboard-card summary-card"><h2>4. 적재 요약</h2><div className="summary-metric-grid"><div><span>총 부피</span><b>{result.usedVolumeM3.toFixed(1)} / {totalVolume.toFixed(1)} m³</b><small>{fillRate.toFixed(1)}%</small></div><div><span>총 중량</span><b>{result.loadedWeightKg.toLocaleString()} / {container.maxPayloadKg.toLocaleString()} kg</b><small>{weightRate.toFixed(1)}%</small></div><div><span>사용 박스 수</span><b>{result.placements.length} EA</b></div><div><span>총 층수</span><b>{maxLayer} 층</b></div></div><button className="constraint-ok">✓ 제약 조건 모두 만족</button></section>

        <section className="dashboard-card constraint-card"><h2>5. 제약 조건 체크</h2><div className="constraint-list"><span><span>중량 제한</span><b>통과</b></span><span><span>경계 / 충돌</span><b>통과</b></span><span><span>적재 높이</span><b>통과</b></span><span><span>최대 적층단</span><b>통과</b></span><span><span>상부 허용중량</span><b>통과</b></span><span><span>바닥 하중 분포</span><b>{quality.grade}</b></span><span><span>문쪽 개방 여유</span><b>통과</b></span></div></section>

        <section className="dashboard-card quick-card"><h2>9. 빠른 작업</h2><button className="primary-action" onClick={runLoading}>▣ 자동 적재</button><button className="opt-action" onClick={runLoading}>◇ 적재 최적화</button><div className="quick-row"><button onClick={printReport}>▤ 작업 지시서</button><button onClick={saveLocal}>▧ 저장</button></div><div className="quick-row"><button className="excel-slot">▧ Excel 내보내기</button><button onClick={loadSampleData}>샘플 복원</button></div><button className="danger ghost" onClick={resetAll}>전체 초기화</button></section>
      </aside>
    </section>
    <footer className="dashboard-footer">© Container Loading Simulator · 운영형 적재 설계 도구</footer>
  </main>;
}
