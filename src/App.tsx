import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { loadContainer } from './engine/loadingEngine';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const initialCargo: CargoItem[] = [
  { id: 'BOX-A', name: 'BOX A', length: 0.6, width: 0.4, height: 0.35, weightKg: 18, quantity: 70, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true },
  { id: 'BOX-B', name: 'BOX B', length: 0.5, width: 0.35, height: 0.3, weightKg: 12, quantity: 55, maxStackLayers: 7, maxTopLoadKg: 80, allowRotation: true },
];

type CargoDraft = Omit<CargoItem, 'id'> & { id: string };
const emptyDraft: CargoDraft = { id: '', name: '', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true };
const STORAGE_KEY = 'container-loading-simulator-v1';
type StoredState = { container: ContainerSpec; cargo: CargoItem[] };

function readStoredState(): StoredState | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as StoredState : null; } catch { return null; }
}

function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

function Scene({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const scale = 0.45;
  const quality = assessWeightBalance(container, result);
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const cy = (container.height * scale) / 2;
  const insideX = -(container.length * scale) / 2;
  const doorX = (container.length * scale) / 2;
  const markerY = container.height * scale + 0.18;
  const cogX = quality.centerOfGravity.x * scale - (container.length * scale) / 2;
  const cogY = quality.centerOfGravity.z * scale;
  const cogZ = quality.centerOfGravity.y * scale - (container.width * scale) / 2;
  const zoneBoundaries = [container.length / 3, (container.length * 2) / 3];

  return <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[5, 8, 6]} intensity={2} />
    <gridHelper args={[8, 20]} position={[0, -0.01, 0]} />
    <mesh position={[0, cy, 0]}><boxGeometry args={[container.length * scale, container.height * scale, container.width * scale]} /><meshBasicMaterial wireframe transparent opacity={0.22} /></mesh>
    {zoneBoundaries.map((x) => { const sx = x * scale - (container.length * scale) / 2; return <mesh key={x} position={[sx, cy, 0]}><boxGeometry args={[0.012, container.height * scale, container.width * scale]} /><meshBasicMaterial transparent opacity={0.18} /></mesh>; })}
    <Text position={[insideX + container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>안쪽 구역</Text>
    <Text position={[0, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>중앙 구역</Text>
    <Text position={[doorX - container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>문쪽 구역</Text>
    <Text position={[insideX + 0.28, markerY, 0]} fontSize={0.13} anchorX="left">안쪽</Text>
    <Text position={[doorX - 0.22, markerY, 0]} fontSize={0.13} anchorX="right">문</Text>
    <mesh position={[doorX + 0.08, markerY, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.07, 0.18, 16]} /><meshStandardMaterial /></mesh>
    <mesh position={[0, markerY, 0]}><boxGeometry args={[container.length * scale, 0.018, 0.018]} /><meshBasicMaterial transparent opacity={0.35} /></mesh>
    <mesh position={[0, cy, 0]}><sphereGeometry args={[0.035, 18, 18]} /><meshStandardMaterial emissiveIntensity={0.7} /></mesh>
    <mesh position={[0, cy, 0]}><boxGeometry args={[0.01, container.height * scale, 0.01]} /><meshBasicMaterial transparent opacity={0.45} /></mesh>
    <mesh position={[0, 0.012, 0]}><boxGeometry args={[container.length * scale, 0.01, 0.01]} /><meshBasicMaterial transparent opacity={0.28} /></mesh>
    <mesh position={[0, 0.012, 0]}><boxGeometry args={[0.01, 0.01, container.width * scale]} /><meshBasicMaterial transparent opacity={0.28} /></mesh>
    {result.placements.map((p, index) => { const a = addresses[index]; const pos: [number, number, number] = [(p.x + p.length / 2) * scale - container.length * scale / 2, (p.z + p.height / 2) * scale, (p.y + p.width / 2) * scale - container.width * scale / 2]; return <group key={`${p.cargoId}-${index}`}><mesh position={pos}><boxGeometry args={[p.length * scale, p.height * scale, p.width * scale]} /><meshStandardMaterial color={cargoColor(p.cargoId)} roughness={0.65} metalness={0.04} /></mesh>{index < 80 && <Text position={[pos[0], pos[1] + p.height * scale / 2 + 0.035, pos[2]]} fontSize={0.055} anchorX="center" anchorY="bottom">{`R${a.row} C${a.column} L${a.layer}${p.rotated ? ' ↻' : ''}`}</Text>}</group>; })}
    {result.placements.length > 0 && <><mesh position={[cogX, cogY, cogZ]}><sphereGeometry args={[0.075, 24, 24]} /><meshStandardMaterial emissiveIntensity={1.2} /></mesh><mesh position={[cogX, cogY / 2, cogZ]}><boxGeometry args={[0.012, Math.max(0.01, cogY), 0.012]} /><meshBasicMaterial transparent opacity={0.5} /></mesh></>}
    <OrbitControls makeDefault />
  </>;
}

export default function App() {
  const stored = useMemo(() => readStoredState(), []);
  const [container, setContainer] = useState<ContainerSpec>(stored?.container ?? defaultContainer);
  const [cargo, setCargo] = useState<CargoItem[]>((stored?.cargo ?? initialCargo).map(item => ({ ...item, allowRotation: item.allowRotation !== false })));
  const [draft, setDraft] = useState<CargoDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [result, setResult] = useState<LoadingResult>(() => loadContainer(stored?.container ?? defaultContainer, (stored?.cargo ?? initialCargo).map(item => ({ ...item, allowRotation: item.allowRotation !== false }))));
  const [saveMessage, setSaveMessage] = useState('');

  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? result.usedVolumeM3 / totalVolume * 100 : 0;
  const waitingCount = useMemo(() => cargo.reduce((sum, item) => sum + item.quantity, 0), [cargo]);
  const quality = useMemo(() => assessWeightBalance(container, result), [container, result]);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result, container.length]);
  const loadedCargoIds = useMemo(() => new Set(result.placements.map(p => p.cargoId)), [result]);
  const legendItems = useMemo(() => cargo.filter(item => loadedCargoIds.has(item.id)), [cargo, loadedCargoIds]);
  const zoneCounts = useMemo(() => addresses.reduce((acc, item) => { acc[item.zone] += 1; return acc; }, { 안쪽: 0, 중앙: 0, 문쪽: 0 }), [addresses]);
  const locationRows = useMemo(() => result.placements.slice(0, 40).map((p, i) => ({ p, a: addresses[i] })), [result, addresses]);

  useEffect(() => { setResult(loadContainer(container, cargo.filter(item => item.quantity > 0))); }, [container.length, container.width, container.height, container.maxPayloadKg]);

  const updateContainer = (field: keyof ContainerSpec, value: string) => setContainer(current => ({ ...current, [field]: Number(value) }));
  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => {
    const numeric: Array<keyof CargoDraft> = ['length','width','height','weightKg','quantity','maxStackLayers','maxTopLoadKg'];
    setDraft(current => ({ ...current, [field]: numeric.includes(field) ? Number(value) : value }));
  };
  const resetDraft = () => { setDraft(emptyDraft); setEditingId(null); };
  const saveCargo = () => {
    const id = draft.id.trim(); const name = draft.name.trim();
    if (!id || !name || draft.length <= 0 || draft.width <= 0 || draft.height <= 0 || draft.weightKg < 0 || draft.quantity < 0) return;
    const next: CargoItem = { ...draft, id, name, quantity: Math.floor(draft.quantity), maxStackLayers: draft.maxStackLayers ? Math.max(1, Math.floor(draft.maxStackLayers)) : undefined, maxTopLoadKg: draft.maxTopLoadKg || undefined, allowRotation: draft.allowRotation !== false };
    setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : items.some(item => item.id === next.id) ? items : [...items, next]); resetDraft();
  };
  const editCargo = (item: CargoItem) => { setEditingId(item.id); setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, maxTopLoadKg: item.maxTopLoadKg ?? 0, allowRotation: item.allowRotation !== false }); };
  const deleteCargo = (id: string) => { setCargo(items => items.filter(item => item.id !== id)); if (editingId === id) resetDraft(); };
  const changeQuantity = (id: string, delta: number) => setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  const runLoading = () => setResult(loadContainer(container, cargo.filter(item => item.quantity > 0)));
  const saveLocal = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ container, cargo } satisfies StoredState)); setSaveMessage('현재 데이터가 이 브라우저에 저장되었습니다.'); };
  const loadLocal = () => { const state = readStoredState(); if (!state) return setSaveMessage('저장된 데이터가 없습니다.'); const normalized = state.cargo.map(item => ({ ...item, allowRotation: item.allowRotation !== false })); setContainer(state.container); setCargo(normalized); setResult(loadContainer(state.container, normalized.filter(item => item.quantity > 0))); setSaveMessage('저장된 데이터를 불러왔습니다.'); };
  const resetAll = () => { setContainer(defaultContainer); setCargo([]); setResult(loadContainer(defaultContainer, [])); localStorage.removeItem(STORAGE_KEY); resetDraft(); setSaveMessage('컨테이너와 박스 데이터를 초기화했습니다.'); };

  return <main className="app-shell">
    <header className="topbar"><div><strong>Container Loading Simulator</strong><span>Codex development v0.19.0</span></div><div className="top-actions"><button className="secondary" onClick={saveLocal}>저장</button><button className="secondary" onClick={loadLocal}>불러오기</button><button onClick={runLoading}>적재 실행</button></div></header>
    <section className="workspace">
      <aside className="panel left-panel">
        <h2>컨테이너 설정</h2><div className="form-grid container-form"><label>길이(m)<input type="number" step="0.01" value={container.length} onChange={e => updateContainer('length', e.target.value)} /></label><label>폭(m)<input type="number" step="0.01" value={container.width} onChange={e => updateContainer('width', e.target.value)} /></label><label>높이(m)<input type="number" step="0.01" value={container.height} onChange={e => updateContainer('height', e.target.value)} /></label><label>최대중량(kg)<input type="number" step="100" value={container.maxPayloadKg} onChange={e => updateContainer('maxPayloadKg', e.target.value)} /></label></div>
        <div className="form-actions utility-actions"><button className="secondary" onClick={saveLocal}>현재 데이터 저장</button><button className="danger" onClick={resetAll}>전체 초기화</button></div>{saveMessage && <p className="muted status-message">{saveMessage}</p>}
        <h2>{editingId ? '박스 수정' : '박스 등록'}</h2><div className="cargo-form"><label>코드<input value={draft.id} onChange={e => updateDraft('id', e.target.value)} disabled={Boolean(editingId)} /></label><label>이름<input value={draft.name} onChange={e => updateDraft('name', e.target.value)} /></label><div className="form-grid"><label>길이(m)<input type="number" step="0.01" value={draft.length} onChange={e => updateDraft('length', e.target.value)} /></label><label>폭(m)<input type="number" step="0.01" value={draft.width} onChange={e => updateDraft('width', e.target.value)} /></label><label>높이(m)<input type="number" step="0.01" value={draft.height} onChange={e => updateDraft('height', e.target.value)} /></label><label>중량(kg)<input type="number" value={draft.weightKg} onChange={e => updateDraft('weightKg', e.target.value)} /></label><label>수량<input type="number" value={draft.quantity} onChange={e => updateDraft('quantity', e.target.value)} /></label><label>최대 적층단<input type="number" value={draft.maxStackLayers ?? 1} onChange={e => updateDraft('maxStackLayers', e.target.value)} /></label><label>상부허용(kg)<input type="number" value={draft.maxTopLoadKg ?? 0} onChange={e => updateDraft('maxTopLoadKg', e.target.value)} /></label></div><label className="rotation-toggle"><input type="checkbox" checked={draft.allowRotation !== false} onChange={e => updateDraft('allowRotation', e.target.checked)} /><span>90도 회전 허용</span></label><div className="form-actions"><button onClick={saveCargo}>{editingId ? '수정 저장' : '박스 추가'}</button>{editingId && <button className="secondary" onClick={resetDraft}>취소</button>}</div></div>
        <h2>대기 화물 <span className="section-count">{waitingCount} EA</span></h2>{cargo.length === 0 ? <p className="muted">등록된 박스가 없습니다.</p> : cargo.map(item => <article className="cargo-card" key={item.id}><div className="cargo-head"><b>{item.name}</b><span>{item.id}</span></div><span>{item.length}×{item.width}×{item.height} m · {item.weightKg} kg/EA</span><span>최대 {item.maxStackLayers ?? '-'}단 · 상부 {item.maxTopLoadKg ?? '-'} kg · 회전 {item.allowRotation === false ? '금지' : '허용'}</span><div className="quantity-row"><button className="mini" onClick={() => changeQuantity(item.id,-1)}>-</button><strong>{item.quantity} EA</strong><button className="mini" onClick={() => changeQuantity(item.id,1)}>+</button></div><div className="card-actions"><button className="secondary" onClick={() => editCargo(item)}>수정</button><button className="danger" onClick={() => deleteCargo(item.id)}>삭제</button></div></article>)}
      </aside>
      <section className="viewer"><Canvas camera={{ position:[5.5,4.2,6.5], fov:48 }}><Scene result={result} container={container} /></Canvas><div className="viewer-direction"><b>적재 방향</b><span>안쪽 → 문쪽</span></div><div className="zone-summary"><span>안쪽 {zoneCounts.안쪽}</span><span>중앙 {zoneCounts.중앙}</span><span>문쪽 {zoneCounts.문쪽}</span></div>{legendItems.length > 0 && <div className="cargo-legend"><b>박스 범례</b><div className="cargo-legend-list">{legendItems.map(item => <span className="legend-item" key={item.id}><i style={{ background:cargoColor(item.id) }} /><span>{item.name}</span><small>{item.id}</small></span>)}</div></div>}</section>
      <aside className="panel right-panel"><h2>적재 결과</h2><div className="metric"><span>적재 수량</span><strong>{result.placements.length}</strong></div><div className="metric"><span>회전 적재</span><strong>{result.placements.filter(p => p.rotated).length}</strong></div><div className="metric"><span>적재 중량</span><strong>{result.loadedWeightKg.toLocaleString()} kg</strong></div><div className="metric"><span>사용 CBM</span><strong>{result.usedVolumeM3.toFixed(2)} m³</strong></div><div className="metric"><span>체적 적재율</span><strong>{fillRate.toFixed(1)}%</strong></div><h2>위치 체계</h2><div className="location-key"><b>R = 행 · C = 열 · L = 단</b><span>행은 안쪽→문쪽, 열은 좌→우, 단은 바닥→위 순서입니다.</span></div><div className="location-list">{locationRows.map(({p,a},i) => <div className="location-row" key={`${p.cargoId}-${i}`}><b>{`R${a.row} C${a.column} L${a.layer}`}</b><span>{p.cargoId}{p.rotated ? ' · 90°' : ''}</span><small>{a.zone}</small></div>)}</div>{result.placements.length > 40 && <p className="muted">앞 40개 위치만 표시합니다. 3D 화면에는 앞 80개 좌표 라벨을 표시합니다.</p>}<h2>무게중심·품질 평가</h2><div className="quality-score"><span>종합 품질</span><strong>{quality.loadingQualityScore.toFixed(0)}점 · {quality.grade}등급</strong></div><div className="metric"><span>균형 점수</span><strong>{quality.balanceScore.toFixed(0)}</strong></div><div className="metric"><span>안정성 점수</span><strong>{quality.stabilityScore.toFixed(0)}</strong></div><div className="metric"><span>앞뒤 중심 편차</span><strong>{quality.longitudinalDeviationPct.toFixed(1)}%</strong></div><div className="metric"><span>좌우 중심 편차</span><strong>{quality.lateralDeviationPct.toFixed(1)}%</strong></div><div className="metric"><span>무게중심 높이</span><strong>{quality.verticalCenterPct.toFixed(1)}%</strong></div><article className="quality-note"><b>무게중심 좌표</b><span>X {quality.centerOfGravity.x.toFixed(2)}m · Y {quality.centerOfGravity.y.toFixed(2)}m · Z {quality.centerOfGravity.z.toFixed(2)}m</span></article>{quality.messages.map((m,i) => <p className="quality-message" key={i}>• {m}</p>)}<h2>자동 검증</h2>{result.validationIssues.length === 0 ? <p className="muted">충돌 및 경계 침범 없음</p> : result.validationIssues.map((issue,index) => <article className="warning-card" key={`${issue.type}-${index}`}><b>{issue.type}</b><span>{issue.message}</span></article>)}<h2>미적재 화물</h2>{result.remaining.length === 0 ? <p className="muted">없음</p> : result.remaining.map(item => <article className="warning-card" key={item.cargoId}><b>{item.cargoId} · {item.quantity} EA</b><span>{item.reason}</span></article>)}</aside>
    </section>
  </main>;
}
