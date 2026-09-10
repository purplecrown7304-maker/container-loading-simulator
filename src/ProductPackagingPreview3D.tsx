import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import { cargoColor } from './cargoColors';
import type { CargoItem, ContainerSpec } from './engine/types';
import './product-packaging-preview.css';

type Props = {
  container: ContainerSpec;
  cargo: CargoItem[];
};

type PreviewBox = {
  key: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  color: string;
};

function floorPreview(container: ContainerSpec, cargo: CargoItem[]) {
  const placed: PreviewBox[] = [];
  let x = 0.04;
  let y = 0.04;
  let rowDepth = 0;
  let shown = 0;
  const requested = cargo.reduce((sum, item) => sum + item.quantity, 0);

  outer: for (const item of cargo) {
    for (let index = 0; index < item.quantity; index += 1) {
      const length = Math.min(item.length, container.length);
      const width = Math.min(item.width, container.width);
      const height = Math.min(item.height, container.height);
      if (y + width > container.width - 0.04) {
        x += rowDepth + 0.04;
        y = 0.04;
        rowDepth = 0;
      }
      if (x + length > container.length - 0.04) break outer;
      placed.push({
        key: `${item.id}-${index}`,
        x: x + length / 2,
        y: y + width / 2,
        z: height / 2,
        length,
        width,
        height,
        color: cargoColor(item.id, item.displayColor),
      });
      y += width + 0.025;
      rowDepth = Math.max(rowDepth, length);
      shown += 1;
      if (shown >= 240) break outer;
    }
  }

  return { placed, shown, requested };
}

function Scene({ container, cargo }: Props) {
  const preview = useMemo(() => floorPreview(container, cargo), [container, cargo]);
  const centerX = container.length / 2;
  const centerY = container.width / 2;

  return <>
    <ambientLight intensity={1.35} />
    <directionalLight position={[container.length * .35, container.height * 2.4, container.width * 1.5]} intensity={1.8} />
    <group position={[-centerX, -container.height * .08, -centerY]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[centerX, centerY, -0.018]} receiveShadow>
        <boxGeometry args={[container.length, container.width, 0.035]} />
        <meshStandardMaterial color="#e8ebef" roughness={.82} />
        <Edges color="#9aa3ad" />
      </mesh>
      {preview.placed.map((box) => <mesh key={box.key} position={[box.x, box.y, box.z]} castShadow receiveShadow>
        <boxGeometry args={[box.length, box.width, box.height]} />
        <meshStandardMaterial color={box.color} roughness={.56} />
        <Edges color="#374151" threshold={15} />
      </mesh>)}
    </group>
    <OrbitControls makeDefault target={[0, 0, 0]} minDistance={2} maxDistance={Math.max(8, container.length * 1.8)} />
  </>;
}

export default function ProductPackagingPreview3D({ container, cargo }: Props) {
  const preview = useMemo(() => floorPreview(container, cargo), [container, cargo]);
  const cameraDistance = Math.max(5.5, container.length * .72);
  return <section className="product-packaging-preview">
    <div className="product-packaging-preview-head">
      <div><b>포장 완료 바닥 미리보기</b><span>최종 적재 전, 선택한 포장 박스를 적재공간 바닥에 1단으로 펼쳐 확인합니다.</span></div>
      <strong>{preview.shown.toLocaleString()} / {preview.requested.toLocaleString()} BOX·EA 표시</strong>
    </div>
    <div className="product-packaging-canvas">
      <Canvas
        shadows
        camera={{ position: [cameraDistance * .65, cameraDistance * .55, cameraDistance], fov: 42, near: .05, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      >
        <Scene container={container} cargo={cargo} />
      </Canvas>
      <div className="product-packaging-canvas-legend"><span>드래그: 회전</span><span>휠: 확대/축소</span><span>1단 펼침 검수</span></div>
    </div>
    {preview.shown < preview.requested && <p className="product-packaging-overflow">바닥에 한 번에 펼칠 수 있는 수량을 초과했습니다. 화면에는 {preview.shown.toLocaleString()}개만 표시하며 실제 자동 적재 단계에서는 전체 {preview.requested.toLocaleString()}개를 계산합니다.</p>}
  </section>;
}
