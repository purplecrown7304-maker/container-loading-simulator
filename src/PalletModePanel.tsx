import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useMemo, useState } from 'react';
import { defaultPalletSpec, packOnPallets, type PalletPackingResult, type PalletSpec } from './engine/palletPacking';
import type { CargoItem, ContainerSpec } from './engine/types';

const STORAGE_KEY = 'container-loading-simulator-v1';
type StoredState = { container: ContainerSpec; cargo: CargoItem[] };

function readStored(): StoredState | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as StoredState : null; } catch { return null; }
}

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

function PalletScene({ state, result, spec }: { state: StoredState; result: PalletPackingResult; spec: PalletSpec }) {
  const scale = 0.42;
  const { container } = state;
  return <>
    <ambientLight intensity={1.45} /><directionalLight position={[5,8,6]} intensity={2} />
    <gridHelper args={[8,20]} position={[0,-0.01,0]} />
    <mesh position={[0,container.height*scale/2,0]}><boxGeometry args={[container.length*scale,container.height*scale,container.width*scale]} /><meshBasicMaterial wireframe transparent opacity={0.2} /></mesh>
    {result.pallets.map((p) => {
      const px = (p.x + p.length/2)*scale - container.length*scale/2;
      const pz = (p.y + p.width/2)*scale - container.width*scale/2;
      return <group key={p.palletIndex}>
        <mesh position={[px,spec.height*scale/2,pz]}><boxGeometry args={[p.length*scale,spec.height*scale,p.width*scale]} /><meshStandardMaterial color="#9b6a3b" roughness={0.85} /></mesh>
        <Text position={[px,spec.height*scale+0.04,pz]} fontSize={0.07}>{`P${p.palletIndex}`}</Text>
        {p.cargoPlacements.map((box,index) => <mesh key={`${box.cargoId}-${index}`} position={[(box.x+box.length/2)*scale-container.length*scale/2,(box.z+box.height/2)*scale,(box.y+box.width/2)*scale-container.width*scale/2]}><boxGeometry args={[box.length*scale,box.height*scale,box.width*scale]} /><meshStandardMaterial color={colorFor(box.cargoId)} roughness={0.65} /></mesh>)}
      </group>;
    })}
    <OrbitControls makeDefault />
  </>;
}

export default function PalletModePanel() {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<PalletSpec>(defaultPalletSpec);
  const [result, setResult] = useState<PalletPackingResult | null>(null);
  const [state, setState] = useState<StoredState | null>(null);
  const [message, setMessage] = useState('');

  const summary = useMemo(() => result ? result.pallets.map((p) => ({ index:p.palletIndex, boxes:p.cargoPlacements.length, cargoWeight:p.cargoWeightKg, totalWeight:p.totalWeightKg, cargoIds:[...new Set(p.cargoPlacements.map((x)=>x.cargoId))].join(', ') })) : [], [result]);

  const run = () => {
    const stored = readStored();
    if (!stored) { setMessage('먼저 메인 화면에서 현재 데이터를 저장하세요.'); setResult(null); setState(null); return; }
    const next = packOnPallets(stored.container, stored.cargo, spec);
    setState(stored); setResult(next);
    setMessage(`팔레트 ${next.palletCount}개 · 화물 ${next.placements.length}EA 계산 완료${next.consolidatedPallets ? ` · ${next.consolidatedPallets}개 팔레트 통합` : ''}`);
  };

  return <div className="pallet-mode-widget">
    <button className="pallet-mode-trigger" onClick={() => setOpen((v)=>!v)}>팔레트 모드</button>
    {open && <section className="pallet-mode-panel">
      <div className="pallet-panel-head"><div><b>팔레트 적재</b><span>저장된 현재 화물 기준</span></div><button className="secondary" onClick={()=>setOpen(false)}>닫기</button></div>
      <div className="pallet-spec-grid">
        <label>길이(m)<input type="number" step="0.01" value={spec.length} onChange={(e)=>setSpec({...spec,length:Number(e.target.value)})} /></label>
        <label>폭(m)<input type="number" step="0.01" value={spec.width} onChange={(e)=>setSpec({...spec,width:Number(e.target.value)})} /></label>
        <label>높이(m)<input type="number" step="0.01" value={spec.height} onChange={(e)=>setSpec({...spec,height:Number(e.target.value)})} /></label>
        <label>팔레트 중량(kg)<input type="number" value={spec.tareWeightKg} onChange={(e)=>setSpec({...spec,tareWeightKg:Number(e.target.value)})} /></label>
        <label>최대 적재중량(kg)<input type="number" value={spec.maxLoadKg} onChange={(e)=>setSpec({...spec,maxLoadKg:Number(e.target.value)})} /></label>
      </div>
      <button className="pallet-run" onClick={run}>팔레트 적재 계산</button>
      {message && <p className="muted">{message}</p>}
      {result && state && <>
        <div className="pallet-preview"><Canvas camera={{ position:[5.5,4.5,6.2], fov:48 }}><PalletScene state={state} result={result} spec={spec} /></Canvas></div>
        <div className="pallet-metrics">
          <div><span>사용 팔레트</span><strong>{result.palletCount}</strong></div><div><span>적재 화물</span><strong>{result.placements.length} EA</strong></div><div><span>화물 중량</span><strong>{result.loadedCargoWeightKg.toLocaleString()} kg</strong></div><div><span>팔레트 포함</span><strong>{result.totalPalletizedWeightKg.toLocaleString()} kg</strong></div>
        </div>
        {result.consolidatedPallets > 0 && <div className="pallet-consolidation">마지막 잔여 팔레트 중 <b>{result.consolidatedPallets}개</b>를 앞 팔레트로 통합해 팔레트 수를 줄였습니다.</div>}
        <div className="pallet-list">{summary.map((p)=><article key={p.index}><b>P{p.index}</b><span>{p.boxes} EA · 화물 {p.cargoWeight.toLocaleString()}kg · 총 {p.totalWeight.toLocaleString()}kg</span><small>{p.cargoIds}</small></article>)}</div>
        {result.remaining.length > 0 && <div className="pallet-remaining"><b>미적재</b>{result.remaining.map((r)=><span key={r.cargoId}>{r.cargoId} {r.quantity}EA · {r.reason}</span>)}</div>}
      </>}
    </section>}
  </div>;
}
