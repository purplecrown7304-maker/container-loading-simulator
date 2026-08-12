import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { defaultPalletSpec, packOnPallets, type PalletPackingResult, type PalletSpec } from './engine/palletPacking';
import type { CargoItem, ContainerSpec } from './engine/types';

type Props = {
  container: ContainerSpec;
  cargo: CargoItem[];
  runToken: number;
};

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

function PalletScene({ container, result, spec }: { container: ContainerSpec; result: PalletPackingResult; spec: PalletSpec }) {
  const scale = 0.42;
  return <>
    <ambientLight intensity={1.45} /><directionalLight position={[5,8,6]} intensity={2} />
    <gridHelper args={[8,20]} position={[0,-0.01,0]} />
    <mesh position={[0,container.height*scale/2,0]}><boxGeometry args={[container.length*scale,container.height*scale,container.width*scale]} /><meshBasicMaterial wireframe transparent opacity={0.2} /></mesh>
    {result.pallets.map((p) => {
      const px = (p.x + p.length/2)*scale - container.length*scale/2;
      const py = (p.z + spec.height/2)*scale;
      const pz = (p.y + p.width/2)*scale - container.width*scale/2;
      const top = Math.max(p.z + spec.height, ...p.cargoPlacements.map((b)=>b.z+b.height));
      return <group key={p.palletIndex}>
        <mesh position={[px,py,pz]}><boxGeometry args={[p.length*scale,spec.height*scale,p.width*scale]} /><meshStandardMaterial color="#9b6a3b" roughness={0.85} /></mesh>
        <Text position={[px,(p.z+spec.height)*scale+0.04,pz]} fontSize={0.065}>{`P${p.palletIndex} · ${p.stackLevel}단`}</Text>
        {p.cargoPlacements.map((box,index) => <mesh key={`${box.cargoId}-${index}`} position={[(box.x+box.length/2)*scale-container.length*scale/2,(box.z+box.height/2)*scale,(box.y+box.width/2)*scale-container.width*scale/2]}><boxGeometry args={[box.length*scale,box.height*scale,box.width*scale]} /><meshStandardMaterial color={colorFor(box.cargoId)} roughness={0.65} /></mesh>)}
        {p.packagingExtraHeightM > 0 && <mesh position={[px,(top+p.packagingExtraHeightM/2)*scale,pz]}><boxGeometry args={[p.length*scale,p.packagingExtraHeightM*scale,p.width*scale]} /><meshStandardMaterial transparent opacity={0.18} /></mesh>}
      </group>;
    })}
    <OrbitControls makeDefault />
  </>;
}

export default function PalletModePanel({ container, cargo, runToken }: Props) {
  const [spec, setSpec] = useState<PalletSpec>(defaultPalletSpec);
  const [result, setResult] = useState<PalletPackingResult>(() => packOnPallets(container, cargo.filter((item) => item.quantity > 0), defaultPalletSpec));

  useEffect(() => {
    if (runToken === 0) return;
    const safeSpec = { ...spec, maxStackLevels: Math.max(1, Math.min(3, Math.floor(spec.maxStackLevels || 1))) };
    setSpec(safeSpec);
    setResult(packOnPallets(container, cargo.filter((item) => item.quantity > 0), safeSpec));
  }, [runToken]);

  const summary = useMemo(() => result.pallets.map((p) => ({
    index:p.palletIndex, level:p.stackLevel, column:p.stackColumn, boxes:p.cargoPlacements.length,
    packagingWeight:p.packagingWeightKg, packagingHeight:p.packagingExtraHeightM,
    corner:p.cornerGuardsUsed, wrap:p.wrappingUsed, totalWeight:p.totalWeightKg,
    cargoIds:[...new Set(p.cargoPlacements.map((x)=>x.cargoId))].join(', '),
  })), [result]);

  return <div className="pallet-inline-workspace">
    <section className="pallet-mode-panel pallet-mode-panel-inline">
      <div className="pallet-panel-head"><div><b>팔레트 적재 설정</b><span>메인 화면의 현재 컨테이너·화물 데이터를 바로 사용합니다.</span></div></div>
      <div className="pallet-spec-grid">
        <label>길이(m)<input type="number" step="0.01" value={spec.length} onChange={(e)=>setSpec({...spec,length:Number(e.target.value)})} /></label>
        <label>폭(m)<input type="number" step="0.01" value={spec.width} onChange={(e)=>setSpec({...spec,width:Number(e.target.value)})} /></label>
        <label>높이(m)<input type="number" step="0.01" value={spec.height} onChange={(e)=>setSpec({...spec,height:Number(e.target.value)})} /></label>
        <label>팔레트 중량(kg)<input type="number" value={spec.tareWeightKg} onChange={(e)=>setSpec({...spec,tareWeightKg:Number(e.target.value)})} /></label>
        <label>최대 적재중량(kg)<input type="number" value={spec.maxLoadKg} onChange={(e)=>setSpec({...spec,maxLoadKg:Number(e.target.value)})} /></label>
        <label>최대 팔레트 적층단<input type="number" min="1" max="3" value={spec.maxStackLevels} onChange={(e)=>setSpec({...spec,maxStackLevels:Number(e.target.value)})} /></label>
        <label>상부 팔레트 허용중량(kg)<input type="number" min="0" value={spec.maxSupportedTopWeightKg} onChange={(e)=>setSpec({...spec,maxSupportedTopWeightKg:Number(e.target.value)})} /></label>
      </div>
      <div className="packaging-options">
        <label className="packaging-toggle"><input type="checkbox" checked={spec.minimizePackaging} onChange={(e)=>setSpec({...spec,minimizePackaging:e.target.checked})} /><span>포장재 최소 사용 자동 최적화</span></label>
        <label className="packaging-toggle"><input type="checkbox" checked={spec.useCornerGuards} onChange={(e)=>setSpec({...spec,useCornerGuards:e.target.checked})} /><span>각대 사용 허용</span></label>
        <label className="packaging-toggle"><input type="checkbox" checked={spec.useWrapping} onChange={(e)=>setSpec({...spec,useWrapping:e.target.checked})} /><span>랩핑 사용 허용</span></label>
      </div>
      <p className="muted">설정을 바꾼 뒤 상단의 <b>적재 실행</b>을 누르면 이 설정으로 다시 계산됩니다.</p>
      <div className="pallet-preview"><Canvas camera={{ position:[5.5,4.5,6.2], fov:48 }}><PalletScene container={container} result={result} spec={spec} /></Canvas></div>
      <div className="pallet-metrics">
        <div><span>사용 팔레트</span><strong>{result.palletCount}</strong></div>
        <div><span>적재 화물</span><strong>{result.placements.length} EA</strong></div>
        <div><span>적층 팔레트</span><strong>{result.stackedPallets}</strong></div>
        <div><span>좌우 중량 차이</span><strong>{result.lateralImbalanceKg.toFixed(0)} kg</strong></div>
        <div><span>포장 적용</span><strong>{result.packagedPalletCount}</strong></div>
        <div><span>포장재 중량</span><strong>{result.totalPackagingWeightKg.toFixed(1)} kg</strong></div>
        <div><span>절감 포장재</span><strong>{result.avoidedPackagingWeightKg.toFixed(1)} kg</strong></div>
        <div><span>총 팔레트화 중량</span><strong>{result.totalPalletizedWeightKg.toFixed(0)} kg</strong></div>
      </div>
      <div className="pallet-list">{summary.map((p)=><article key={p.index}><b>P{p.index}</b><span>{p.column}열 · {p.level}단 · {p.boxes} EA · 총 {p.totalWeight.toLocaleString()}kg</span><small>{p.cargoIds}</small><small>포장: {p.corner ? '각대 ' : ''}{p.wrap ? '랩핑' : ''}{!p.corner && !p.wrap ? '없음' : ''} · {p.packagingWeight.toFixed(1)}kg · 높이 +{p.packagingHeight.toFixed(2)}m</small></article>)}</div>
      {result.remaining.length > 0 && <div className="pallet-remaining"><b>미적재/제약</b>{result.remaining.map((r)=><span key={`${r.cargoId}-${r.reason}`}>{r.cargoId} {r.quantity}EA · {r.reason}</span>)}</div>}
    </section>
  </div>;
}
