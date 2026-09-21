import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import EquipmentShell3D from './EquipmentShell3D';
import type { ContainerSpec } from './engine/types';
import './loading-space.css';

export default function LoadingSpacePreview({ container }: { container: ContainerSpec }) {
  const [open, setOpen] = useState(false);
  const scale = 5 / Math.max(container.length, container.width, container.height, 1);
  const length = container.length * scale, width = container.width * scale, height = container.height * scale;
  return <section className="space-preview" aria-label="실시간 3D 적재 공간 미리보기">
    <div className="space-preview-heading"><span><b>LIVE 3D</b> 실제 내부 규격 미리보기</span><button type="button" aria-pressed={open} onClick={() => setOpen(value => !value)}>{open ? '장비 모델 보기' : '내부 공간 보기'}</button></div>
    <div className="space-preview-canvas">
      <Canvas key={`${length}-${width}-${height}`} camera={{ position: [4.6, 3, 4.6], fov: 42 }} dpr={[1, 1.5]} frameloop="demand" fallback={<p>3D 미리보기에는 WebGL을 지원하는 브라우저가 필요합니다.</p>}>
        <color attach="background" args={['#edf3f9']} />
        <ambientLight intensity={1.9}/><directionalLight position={[4, 7, 5]} intensity={2.5}/>
        {!open && <EquipmentShell3D container={container} scale={scale}/>}
        <mesh position={[0, height / 2, 0]}><boxGeometry args={[length, height, width]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/><Edges color="#2375ab"/></mesh>
        <mesh position={[0, -0.015, 0]}><boxGeometry args={[length, 0.025, width]}/><meshStandardMaterial color="#a8c8df"/></mesh>
        <gridHelper args={[8, 32, '#b2c7d8', '#d5e2ec']} position={[0, -0.04, 0]}/>
        <OrbitControls makeDefault target={[0, height / 2, 0]} minDistance={2} maxDistance={16} maxPolarAngle={Math.PI / 2 - 0.02}/>
      </Canvas>
    </div>
    <div className="space-preview-footer"><span>드래그 회전 · 휠 확대 · 우클릭 이동</span><b>{(container.length * container.width * container.height).toFixed(2)} m³</b></div>
  </section>;
}
