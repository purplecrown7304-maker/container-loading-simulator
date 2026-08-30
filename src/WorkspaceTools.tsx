import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { cargoColor } from './cargoColors';
import { readStoredState, writeStoredState, type StoredState } from './storage';
import { EXCEL_IMPORT_EVENT, OPEN_WORKSPACE_EVENT, type WorkspaceOpenDetail } from './uiEvents';

const BOX_KEY = 'container-loading-workspace-boxes-v1';
const VEHICLE_KEY = 'container-loading-workspace-vehicles-v1';
const SAFETY_KEY = 'container-loading-workspace-safety-v1';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };
type DataBox = { id: string; name: string; savedAt: string; state: StoredState };
type VehiclePreset = { id: string; name: string; spec: ContainerSpec };
type View = null | 'boxes' | 'vehicles' | 'safety' | 'data';

type Props = { showNav?: boolean };

const builtInVehicles: VehiclePreset[] = [
  { id: '20ft', name: '20FT Standard', spec: { length: 5.90, width: 2.35, height: 2.39, maxPayloadKg: 28200 } },
  { id: '40ft', name: '40FT Standard', spec: { length: 12.03, width: 2.35, height: 2.39, maxPayloadKg: 26700 } },
  { id: '40hc', name: '40FT High Cube', spec: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 } },
];

const catalogSeed: CargoItem[] = Array.from({ length: 18 }, (_, i) => ({
  id: `BOX-${String(i + 1).padStart(3, '0')}`,
  name: `가상 화물 ${String(i + 1).padStart(2, '0')}`,
  length: [.4, .5, .6, .7, .8][i % 5],
  width: [.3, .38, .46, .54][i % 4],
  height: [.25, .32, .39, .46, .53, .6][i % 6],
  weightKg: 8 + i * 4,
  quantity: i < 3 ? [70, 24, 30][i] : 0,
  maxStackLayers: 3 + i % 5,
  maxTopLoadKg: 24 + i * 24,
  allowRotation: i % 6 !== 5,
}));

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function currentState(): StoredState | null {
  const latest = (window as LoadingWindow).__containerLoadingLatestResult;
  return latest ? { container: latest.container, cargo: latest.cargo } : readStoredState();
}

function viewTitle(view: Exclude<View, null>) {
  if (view === 'boxes') return '박스 선택';
  if (view === 'vehicles') return '차량 관리';
  if (view === 'safety') return '오늘의 안전 점검';
  return '계획 관리';
}

export default function WorkspaceTools({ showNav = true }: Props) {
  const [view, setView] = useState<View>(null);
  const [boxes, setBoxes] = useState<DataBox[]>(() => readJson(BOX_KEY, []));
  const [customVehicles, setCustomVehicles] = useState<VehiclePreset[]>(() => readJson(VEHICLE_KEY, []));
  const [boxName, setBoxName] = useState('');
  const [vehicleName, setVehicleName] = useState('내 차량');
  const [vehicleSpec, setVehicleSpec] = useState<ContainerSpec>({ length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 });
  const [message, setMessage] = useState('');
  const [catalog, setCatalog] = useState<CargoItem[]>(catalogSeed);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const safetyDone = readJson<{ date?: string }>(SAFETY_KEY, {}).date === todayKey();

  useEffect(() => localStorage.setItem(BOX_KEY, JSON.stringify(boxes)), [boxes]);
  useEffect(() => localStorage.setItem(VEHICLE_KEY, JSON.stringify(customVehicles)), [customVehicles]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const tab = (event as CustomEvent<WorkspaceOpenDetail>).detail?.tab;
      if (tab === 'boxes' || tab === 'vehicles' || tab === 'safety' || tab === 'data') {
        setMessage('');
        setView(tab);
      }
    };
    window.addEventListener(OPEN_WORKSPACE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WORKSPACE_EVENT, onOpen);
  }, []);

  const latest = typeof window === 'undefined' ? undefined : (window as LoadingWindow).__containerLoadingLatestResult;
  const safetyRows = useMemo(() => {
    if (!latest) return [];
    const over = latest.cargo.filter(x => x.length > latest.container.length || x.width > latest.container.width || x.height > latest.container.height);
    return [
      { label: '박스 규격', ok: !over.length, detail: over.length ? `${over.length}개 품목 규격 초과` : '모든 품목 규격 정상' },
      { label: '경계 / 충돌', ok: !latest.result.validationIssues.length, detail: `검증 이슈 ${latest.result.validationIssues.length}건` },
      { label: '최대 적재중량', ok: latest.result.loadedWeightKg <= latest.container.maxPayloadKg, detail: `${latest.result.loadedWeightKg.toLocaleString()} / ${latest.container.maxPayloadKg.toLocaleString()} kg` },
      { label: '미적재 확인', ok: !latest.result.remaining.length, detail: `미적재 ${latest.result.remaining.reduce((s, x) => s + x.quantity, 0)}EA` },
    ];
  }, [latest]);

  const filtered = catalog.filter(x => `${x.id} ${x.name}`.toLowerCase().includes(query.toLowerCase()));
  const chosen = catalog.filter(x => (selected[x.id] ?? 0) > 0);

  const importSelected = () => {
    const state = currentState();
    const cargo = chosen.map(x => ({ ...x, quantity: selected[x.id] }));
    writeStoredState({ container: state?.container ?? builtInVehicles[2].spec, cargo }, true);
    setView(null);
  };

  const saveBox = () => {
    const state = currentState();
    if (!state) return setMessage('저장할 현재 작업 데이터가 없습니다.');
    const name = boxName.trim() || `작업 ${boxes.length + 1}`;
    setBoxes(previous => [{ id: crypto.randomUUID(), name, savedAt: new Date().toISOString(), state }, ...previous].slice(0, 30));
    setBoxName('');
    setMessage(`${name} 계획을 저장했습니다.`);
  };

  const restoreBox = (box: DataBox) => {
    writeStoredState(box.state, true);
    setMessage(`${box.name} 계획을 불러왔습니다.`);
    setView(null);
  };

  const deleteBox = (id: string) => {
    setBoxes(previous => previous.filter(item => item.id !== id));
    setMessage('저장 계획을 삭제했습니다.');
  };

  const applyVehicle = (preset: VehiclePreset) => {
    const state = currentState();
    writeStoredState({ container: preset.spec, cargo: state?.cargo ?? [] }, true);
    setMessage(`${preset.name} 규격을 적용했습니다.`);
  };

  const saveVehicle = () => {
    const name = vehicleName.trim() || '내 차량';
    setCustomVehicles(previous => [{ id: crypto.randomUUID(), name, spec: { ...vehicleSpec } }, ...previous].slice(0, 12));
    setMessage(`${name} 차량을 저장했습니다.`);
  };

  const completeSafety = () => {
    if (!latest) return setMessage('먼저 적재 계산을 실행해 주세요.');
    localStorage.setItem(SAFETY_KEY, JSON.stringify({ date: todayKey(), rows: safetyRows }));
    setMessage('오늘의 안전 점검을 기록했습니다.');
  };

  return <>
    {showNav && <div className="workspace-tools-nav">
      <button onClick={() => setView('boxes')}>박스 선택</button>
      <button onClick={() => setView('vehicles')}>차량 관리</button>
      <button className={safetyDone ? 'done' : ''} onClick={() => setView('safety')}>{safetyDone ? '✓ 일일 점검' : '일일 점검'}</button>
    </div>}

    {view && createPortal(
      <div className="workspace-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setView(null); }}>
        <section className={`workspace-modal ${view === 'boxes' ? 'box-selector-modal' : ''}`}>
          <header><b>{viewTitle(view)}</b><button onClick={() => setView(null)}>닫기</button></header>

          {view === 'boxes' && <div className="box-selector-body">
            <div className="box-selector-actions">
              <div>
                <button onClick={() => setRegisterOpen(value => !value)}>신규 박스 정보 등록</button>
                <button onClick={() => window.dispatchEvent(new CustomEvent(EXCEL_IMPORT_EVENT, { detail: { action: 'template' } }))}>기초 엑셀 다운로드</button>
              </div>
              <button className="blue" onClick={importSelected}>수량 입력 박스 적재 투입</button>
            </div>
            {registerOpen && <div className="box-register">
              <b>신규 박스 일괄 등록</b>
              <span>샘플 항목을 추가한 뒤 값과 수량을 수정할 수 있습니다.</span>
              <button onClick={() => setCatalog(previous => [...previous, { id: `BOX-${String(previous.length + 1).padStart(3, '0')}`, name: `신규 화물 ${previous.length + 1}`, length: .5, width: .4, height: .3, weightKg: 10, quantity: 0, maxStackLayers: 5, maxTopLoadKg: 80, allowRotation: true }])}>신규 박스 추가</button>
            </div>}
            <label className="box-search-label">박스 검색</label>
            <div className="box-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="박스코드, 내용물 검색" /><button onClick={() => setQuery('')}>검색 초기화</button></div>
            <div className="selected-boxes"><b>선택된 박스</b><small>{chosen.length}종 선택</small><div>{chosen.length ? chosen.map(x => <span key={x.id} style={{ borderLeftColor: cargoColor(x.id) }}>{x.id} · {x.name} <b>{selected[x.id]}EA</b></span>) : '아래 목록에서 박스를 선택하면 이곳에 표시됩니다.'}</div></div>
            <div className="catalog-wrap"><table><caption>등록된 박스 목록</caption><thead><tr><th>선택</th><th>NO</th><th>박스코드</th><th>내용물</th><th>L</th><th>W</th><th>T</th><th>중량</th><th>CBM</th><th>재질</th><th>최대보관중량</th><th>최대적층단</th><th>취급주의</th><th>색상</th><th>회전허용</th><th>적재 수량</th></tr></thead><tbody>
              {filtered.map((x, i) => <tr key={x.id}>
                <td><input type="checkbox" checked={(selected[x.id] ?? 0) > 0} onChange={event => setSelected(state => ({ ...state, [x.id]: event.target.checked ? Math.max(1, x.quantity) : 0 }))} /></td>
                <td>{i + 1}</td><td>{x.id}</td><td>{x.name}</td><td>{Math.round(x.length * 1000)}</td><td>{Math.round(x.width * 1000)}</td><td>{Math.round(x.height * 1000)}</td><td>{x.weightKg}</td><td>{(x.length * x.width * x.height).toFixed(3)}</td><td>{['골판지', '이중 골판지', '플라스틱', '합판', '완충재 포함'][i % 5]}</td><td>{x.maxTopLoadKg}</td><td>{x.maxStackLayers}</td><td>일반</td><td><i className="catalog-color" style={{ background: cargoColor(x.id) }} /></td><td>{x.allowRotation ? '허용' : '금지'}</td>
                <td><input className="qty-input" type="number" min="0" value={selected[x.id] ?? x.quantity} onChange={event => setSelected(state => ({ ...state, [x.id]: Math.max(0, Number(event.target.value)) }))} /></td>
              </tr>)}
            </tbody></table></div>
          </div>}

          {view === 'vehicles' && <div className="workspace-modal-body">
            <div className="vehicle-preset-grid">{[...builtInVehicles, ...customVehicles].map(preset => <button key={preset.id} onClick={() => applyVehicle(preset)}><b>{preset.name}</b><span>{preset.spec.length.toFixed(2)} × {preset.spec.width.toFixed(2)} × {preset.spec.height.toFixed(2)}m</span></button>)}</div>
            <div className="vehicle-form"><h3>커스텀 차량 추가</h3><label>이름<input value={vehicleName} onChange={event => setVehicleName(event.target.value)} /></label><div className="vehicle-fields">{(['length', 'width', 'height', 'maxPayloadKg'] as const).map(key => <label key={key}>{key}<input type="number" value={vehicleSpec[key]} onChange={event => setVehicleSpec(state => ({ ...state, [key]: Number(event.target.value) }))} /></label>)}</div><button onClick={saveVehicle}>차량 규격 저장</button></div>
          </div>}

          {view === 'safety' && <div className="workspace-modal-body">
            {safetyRows.length ? <div className="safety-list">{safetyRows.map(row => <article key={row.label} className={row.ok ? 'ok' : 'warn'}><span>{row.ok ? '✓' : '!'}</span><div><b>{row.label}</b><small>{row.detail}</small></div></article>)}</div> : <div className="workspace-empty-state"><b>점검할 적재 결과가 없습니다.</b><span>적재 최적화를 실행한 뒤 다시 열어 주세요.</span></div>}
            <button className="safety-complete" onClick={completeSafety} disabled={!safetyRows.length}>오늘 안전 점검 완료</button>
          </div>}

          {view === 'data' && <div className="workspace-modal-body plan-manager">
            <div className="workspace-inline"><input value={boxName} onChange={event => setBoxName(event.target.value)} placeholder="현재 작업 저장 이름" /><button onClick={saveBox}>현재 계획 저장</button></div>
            <div className="saved-plan-list">
              {boxes.length ? boxes.map(box => <article key={box.id}>
                <div><b>{box.name}</b><small>{new Date(box.savedAt).toLocaleString()} · {box.state.cargo.length}종 화물</small></div>
                <div><button onClick={() => restoreBox(box)}>불러오기</button><button className="danger" onClick={() => deleteBox(box.id)}>삭제</button></div>
              </article>) : <div className="workspace-empty-state"><b>저장된 계획이 없습니다.</b><span>위 입력란에 이름을 적고 현재 계획을 저장하세요.</span></div>}
            </div>
          </div>}

          {message && <footer>{message}</footer>}
        </section>
      </div>,
      document.body,
    )}
  </>;
}
