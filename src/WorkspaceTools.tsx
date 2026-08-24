import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { readStoredState, writeStoredState, type StoredState } from './storage';

const BOX_KEY = 'container-loading-workspace-boxes-v1';
const VEHICLE_KEY = 'container-loading-workspace-vehicles-v1';
const SAFETY_KEY = 'container-loading-workspace-safety-v1';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };
type DataBox = { id: string; name: string; savedAt: string; state: StoredState };
type VehiclePreset = { id: string; name: string; spec: ContainerSpec };
type View = null | 'boxes' | 'vehicles' | 'safety';

const builtInVehicles: VehiclePreset[] = [
  { id: '20ft', name: '20FT Standard', spec: { length: 5.90, width: 2.35, height: 2.39, maxPayloadKg: 28200 } },
  { id: '40ft', name: '40FT Standard', spec: { length: 12.03, width: 2.35, height: 2.39, maxPayloadKg: 26700 } },
  { id: '40hc', name: '40FT High Cube', spec: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 } },
];

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function currentState(): StoredState | null {
  const latest = (window as LoadingWindow).__containerLoadingLatestResult;
  return latest ? { container: latest.container, cargo: latest.cargo } : readStoredState();
}

export default function WorkspaceTools() {
  const [target, setTarget] = useState<Element | null>(null);
  const [view, setView] = useState<View>(null);
  const [boxes, setBoxes] = useState<DataBox[]>(() => readJson<DataBox[]>(BOX_KEY, []));
  const [customVehicles, setCustomVehicles] = useState<VehiclePreset[]>(() => readJson<VehiclePreset[]>(VEHICLE_KEY, []));
  const [boxName, setBoxName] = useState('');
  const [vehicleName, setVehicleName] = useState('내 차량');
  const [vehicleSpec, setVehicleSpec] = useState<ContainerSpec>({ length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 });
  const [message, setMessage] = useState('');
  const safetyDone = readJson<{ date?: string }>(SAFETY_KEY, {}).date === todayKey();

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector('.mockup-topbar'));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => { localStorage.setItem(BOX_KEY, JSON.stringify(boxes)); }, [boxes]);
  useEffect(() => { localStorage.setItem(VEHICLE_KEY, JSON.stringify(customVehicles)); }, [customVehicles]);
  useEffect(() => { if (!view) setMessage(''); }, [view]);

  const latest = typeof window === 'undefined' ? undefined : (window as LoadingWindow).__containerLoadingLatestResult;
  const safetyRows = useMemo(() => {
    if (!latest) return [];
    const oversize = latest.cargo.filter(item => item.length > latest.container.length || item.width > latest.container.width || item.height > latest.container.height);
    const payloadOk = latest.result.loadedWeightKg <= latest.container.maxPayloadKg;
    return [
      { label: '박스 규격', ok: oversize.length === 0, detail: oversize.length ? `${oversize.length}개 품목이 컨테이너 규격을 초과합니다.` : '모든 품목이 컨테이너 내부 규격 이내입니다.' },
      { label: '경계 / 충돌', ok: latest.result.validationIssues.length === 0, detail: latest.result.validationIssues.length ? `${latest.result.validationIssues.length}건 검증 이슈` : '경계·충돌 검증 이상 없음' },
      { label: '최대 적재중량', ok: payloadOk, detail: `${latest.result.loadedWeightKg.toLocaleString()} / ${latest.container.maxPayloadKg.toLocaleString()} kg` },
      { label: '미적재 확인', ok: latest.result.remaining.length === 0, detail: latest.result.remaining.length ? `${latest.result.remaining.reduce((s, x) => s + x.quantity, 0)}EA 미적재` : '요청 수량 전체 적재' },
    ];
  }, [latest]);

  const saveBox = () => {
    const state = currentState();
    if (!state) return setMessage('저장할 현재 작업 데이터가 없습니다.');
    const name = boxName.trim() || `작업 ${boxes.length + 1}`;
    setBoxes(prev => [{ id: crypto.randomUUID(), name, savedAt: new Date().toISOString(), state }, ...prev].slice(0, 12));
    setBoxName(''); setMessage(`${name} 데이터 박스를 저장했습니다.`);
  };
  const loadBox = (box: DataBox) => { writeStoredState(box.state, true); setView(null); };
  const deleteBox = (id: string) => setBoxes(prev => prev.filter(box => box.id !== id));

  const applyVehicle = (preset: VehiclePreset) => {
    const state = currentState();
    writeStoredState({ container: preset.spec, cargo: state?.cargo ?? [] }, true);
    setMessage(`${preset.name} 규격을 적용했습니다.`);
  };
  const saveVehicle = () => {
    const name = vehicleName.trim() || '내 차량';
    if ([vehicleSpec.length, vehicleSpec.width, vehicleSpec.height].some(v => !Number.isFinite(v) || v <= 0) || vehicleSpec.maxPayloadKg < 0) return setMessage('차량 내부 규격을 확인하세요.');
    setCustomVehicles(prev => [{ id: crypto.randomUUID(), name, spec: { ...vehicleSpec } }, ...prev].slice(0, 12));
    setMessage(`${name} 차량을 저장했습니다.`);
  };
  const completeSafety = () => {
    if (!latest) return setMessage('먼저 자동 적재를 실행하세요.');
    localStorage.setItem(SAFETY_KEY, JSON.stringify({ date: todayKey(), checkedAt: new Date().toISOString(), rows: safetyRows }));
    setMessage('오늘의 안전 점검을 기록했습니다.');
  };

  if (!target) return null;
  return <>
    {createPortal(<div className="workspace-tools-nav">
      <span className="workspace-kicker">SMART LOGISTICS WORKSPACE</span>
      <button onClick={() => setView('boxes')}>데이터 박스</button>
      <button onClick={() => setView('vehicles')}>차량 관리</button>
      <button className={safetyDone ? 'done' : ''} onClick={() => setView('safety')}>{safetyDone ? '✓ 안전 점검' : '안전 점검'}</button>
    </div>, target)}

    {view && createPortal(<div className="workspace-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setView(null); }}>
      <section className="workspace-modal" role="dialog" aria-modal="true">
        <header><div><small>SMART LOGISTICS WORKSPACE</small><b>{view === 'boxes' ? '데이터 박스' : view === 'vehicles' ? '커스텀 차량 관리' : '오늘의 안전 점검'}</b></div><button onClick={() => setView(null)}>✕</button></header>

        {view === 'boxes' && <div className="workspace-modal-body">
          <p className="workspace-help">현재 컨테이너 규격과 화물 목록을 하나의 작업 슬롯으로 저장합니다.</p>
          <div className="workspace-inline"><input value={boxName} onChange={e => setBoxName(e.target.value)} placeholder="예: 8월 24일 베트남 출하"/><button onClick={saveBox}>현재 작업 저장</button></div>
          <div className="workspace-list">{boxes.length === 0 ? <div className="workspace-empty">저장된 데이터 박스가 없습니다.</div> : boxes.map(box => <article key={box.id}><div><b>{box.name}</b><span>{new Date(box.savedAt).toLocaleString('ko-KR')}</span><small>{box.state.cargo.length}개 품목 · {box.state.cargo.reduce((s, x) => s + x.quantity, 0)}EA</small></div><div><button onClick={() => loadBox(box)}>불러오기</button><button className="danger" onClick={() => deleteBox(box.id)}>삭제</button></div></article>)}</div>
        </div>}

        {view === 'vehicles' && <div className="workspace-modal-body">
          <p className="workspace-help">기본 컨테이너 또는 회사에서 실제 사용하는 차량 내부 규격을 저장해 바로 적용합니다.</p>
          <div className="vehicle-preset-grid">{[...builtInVehicles, ...customVehicles].map(preset => <button key={preset.id} onClick={() => applyVehicle(preset)}><b>{preset.name}</b><span>{preset.spec.length.toFixed(2)} × {preset.spec.width.toFixed(2)} × {preset.spec.height.toFixed(2)}m</span><small>{preset.spec.maxPayloadKg.toLocaleString()}kg</small></button>)}</div>
          <div className="vehicle-form"><h3>커스텀 차량 추가</h3><label>이름<input value={vehicleName} onChange={e => setVehicleName(e.target.value)}/></label><div className="vehicle-fields"><label>길이(m)<input type="number" value={vehicleSpec.length} onChange={e => setVehicleSpec(s => ({...s,length:Number(e.target.value)}))}/></label><label>폭(m)<input type="number" value={vehicleSpec.width} onChange={e => setVehicleSpec(s => ({...s,width:Number(e.target.value)}))}/></label><label>높이(m)<input type="number" value={vehicleSpec.height} onChange={e => setVehicleSpec(s => ({...s,height:Number(e.target.value)}))}/></label><label>최대중량(kg)<input type="number" value={vehicleSpec.maxPayloadKg} onChange={e => setVehicleSpec(s => ({...s,maxPayloadKg:Number(e.target.value)}))}/></label></div><button onClick={saveVehicle}>차량 규격 저장</button></div>
        </div>}

        {view === 'safety' && <div className="workspace-modal-body">
          <p className="workspace-help">하루 한 번 현재 적재 결과의 기본 안전 항목을 빠르게 확인하고 날짜별로 기록합니다.</p>
          {!latest ? <div className="workspace-empty">자동 적재를 한 번 실행하면 점검 항목이 표시됩니다.</div> : <div className="safety-list">{safetyRows.map(row => <article key={row.label} className={row.ok ? 'ok' : 'warn'}><span>{row.ok ? '✓' : '!'}</span><div><b>{row.label}</b><small>{row.detail}</small></div></article>)}</div>}
          <button className="safety-complete" disabled={!latest} onClick={completeSafety}>{safetyDone ? '오늘 점검 다시 기록' : '오늘 안전 점검 완료'}</button>
        </div>}
        {message && <footer>{message}</footer>}
      </section>
    </div>, document.body)}
  </>;
}
