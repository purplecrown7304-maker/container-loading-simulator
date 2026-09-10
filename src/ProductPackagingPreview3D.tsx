import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import { cargoColor } from './cargoColors';
import type { CargoItem, ContainerSpec } from './engine/types';
import './product-packaging-preview.css';

type Props = { container: ContainerSpec; cargo: CargoItem[] };
type PreviewBox = { key: string; x: number; y: number; length: number; width: number; height: number; color: string };

function floorPreview(container: ContainerSpec, cargo: CargoItem[]) {
  const placed: PreviewBox[] = [];
  let x = 0.04;
  let y = 0.04;
  let rowLength = 0;
  let shown = 0;
  const requested = cargo.reduce((sum, item) => sum + item.quantity, 0);

  outer: for (const item of cargo) {
    for (let index = 0; index < item.quantity; index += 1) {
      const length = Math.min(item.length, container.length);
      const width = Math.min(item.width, container.width);
      const height = Math.min(item.height, container.height);
      if (y + width > container.width - 0.04) {
        x += rowLength + 0.04;
        y = 0.04;
        rowLength = 0;
      }
      if (x + length > container.length - 0.04) break outer;
      placed.push({ key: `${item.id}-${index}`, x: x + length / 2, y: y + width / 2, length, width, height, color: cargoColor(item.id, item.displayColor) });
      y += width + 0.025;
      rowLength = Math.max(rowLength, length);
      shown += 1;
      if (shown >= 240) break outer;
    }
  }
  return { placed, shown, requested };
}

function Scene({ container, cargo }: Props) {
  const preview = useMemo(() => floorPreview(container, cargo), [container, cargo]);
  const cx = container.length / 2;
  const cz = container.width / 2;
  return <>
    <ambientLight intensity={1.35} />
    <directionalLight position={[container.length * .25, container.height * 2.6, container.width * 1.6]} intensity={1.8} castShadow />
    <mesh position={[0, -0.025, 0]} receiveShadow>
      <boxGeometry args={[container.length, 0.05, container.width]} />
      <meshStandardMaterial color="#e8ebef" roughness={.82} />
      <Edges color="#9aa3ad" />
    </mesh>
    {preview.placed.map(box => <mesh key={box.key} position={[box.x - cx, box.height / 2, box.y - cz]} castShadow receiveShadow>
      <boxGeometry args={[box.length, box.height, box.width]} />
      <meshStandardMaterial color={box.color} roughness={.56} />
      <Edges color="#374151" threshold={15} />
    </mesh>)}
    <gridHelper args={[Math.max(container.length, container.width) * 1.15, 24, '#b9c2cb', '#d7dde3']} position={[0, 0.002, 0]} />
    <OrbitControls makeDefault target={[0, Math.min(.8, container.height * .25), 0]} minDistance={2} maxDistance={Math.max(8, container.length * 1.8)} />
  </>;
}

export default function ProductPackagingPreview3D({ container, cargo }: Props) {
  const preview = useMemo(() => floorPreview(container, cargo), [container, cargo]);
  const cameraDistance = Math.max(5.5, container.length * .72);
  return <section className="product-packaging-preview">
    <div className="product-packaging-preview-head"><div><b>포장 완료 바닥 미리보기</b><span>최종 적재 전, 선택한 포장 박스를 적재공간 바닥에 1단으로 펼쳐 확인합니다.</span></div><strong>{preview.shown.toLocaleString()} / {preview.requested.toLocaleString()} BOX·EA 표시</strong></div>
    <div className="product-packaging-canvas">
      <Canvas shadows camera={{ position: [cameraDistance * .7, cameraDistance * .62, cameraDistance], fov: 42, near: .05, far: 200 }} gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}>
        <Scene container={container} cargo={cargo} />
      </Canvas>
      <div className="product-packaging-canvas-legend"><span>드래그: 회전</span><span>휠: 확대/축소</span><span>1단 펼침 검수</span></div>
    </div>
    {preview.shown < preview.requested && <p className="product-packaging-overflow">바닥에 한 번에 펼칠 수 있는 수량을 초과했습니다. 화면에는 {preview.shown.toLocaleString()}개만 표시하며 실제 자동 적재 단계에서는 전체 {preview.requested.toLocaleString()}개를 계산합니다.</p>}
  </section>;
}
