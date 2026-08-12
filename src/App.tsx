import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { loadContainer } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec } from './engine/types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const cargo: CargoItem[] = [
  {
    id: 'BOX-A',
    name: 'BOX A',
    length: 0.6,
    width: 0.4,
    height: 0.35,
    weightKg: 18,
    quantity: 70,
    maxStackLayers: 7,
  },
  {
    id: 'BOX-B',
    name: 'BOX B',
    length: 0.5,
    width: 0.35,
    height: 0.3,
    weightKg: 12,
    quantity: 55,
    maxStackLayers: 7,
  },
];

function Scene() {
  const result = loadContainer(container, cargo);
  const scale = 0.45;

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 6]} intensity={2} />
      <gridHelper args={[8, 20]} position={[0, -0.01, 0]} />

      <mesh position={[0, (container.height * scale) / 2, 0]}>
        <boxGeometry
          args={[
            container.length * scale,
            container.height * scale,
            container.width * scale,
          ]}
        />
        <meshBasicMaterial wireframe transparent opacity={0.22} />
      </mesh>

      {result.placements.map((placement, index) => (
        <mesh
          key={`${placement.cargoId}-${index}`}
          position={[
            (placement.x + placement.length / 2) * scale -
              (container.length * scale) / 2,
            (placement.z + placement.height / 2) * scale,
            (placement.y + placement.width / 2) * scale -
              (container.width * scale) / 2,
          ]}
        >
          <boxGeometry
            args={[
              placement.length * scale,
              placement.height * scale,
              placement.width * scale,
            ]}
          />
          <meshStandardMaterial />
        </mesh>
      ))}

      <OrbitControls makeDefault />
    </>
  );
}

export default function App() {
  const result = loadContainer(container, cargo);
  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? (result.usedVolumeM3 / totalVolume) * 100 : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>Container Loading Simulator</strong>
          <span>Codex development v0.1.0</span>
        </div>
        <button>적재 실행</button>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <h2>컨테이너 설정</h2>
          <dl>
            <div><dt>길이</dt><dd>{container.length} m</dd></div>
            <div><dt>폭</dt><dd>{container.width} m</dd></div>
            <div><dt>높이</dt><dd>{container.height} m</dd></div>
            <div><dt>최대 중량</dt><dd>{container.maxPayloadKg.toLocaleString()} kg</dd></div>
          </dl>
          <h2>대기 화물</h2>
          {cargo.map((item) => (
            <article className="cargo-card" key={item.id}>
              <b>{item.name}</b>
              <span>{item.quantity} EA · {item.weightKg} kg/EA</span>
            </article>
          ))}
        </aside>

        <section className="viewer">
          <Canvas camera={{ position: [5.5, 4.2, 6.5], fov: 48 }}>
            <Scene />
          </Canvas>
        </section>

        <aside className="panel right-panel">
          <h2>적재 결과</h2>
          <div className="metric"><span>적재 수량</span><strong>{result.placements.length}</strong></div>
          <div className="metric"><span>적재 중량</span><strong>{result.loadedWeightKg.toLocaleString()} kg</strong></div>
          <div className="metric"><span>사용 CBM</span><strong>{result.usedVolumeM3.toFixed(2)} m³</strong></div>
          <div className="metric"><span>체적 적재율</span><strong>{fillRate.toFixed(1)}%</strong></div>
          <h2>혼합 적재 대기</h2>
          {result.remaining.length === 0 ? (
            <p className="muted">없음</p>
          ) : (
            result.remaining.map((item) => (
              <article className="warning-card" key={item.cargoId}>
                <b>{item.cargoId} · {item.quantity} EA</b>
                <span>{item.reason}</span>
              </article>
            ))
          )}
        </aside>
      </section>
    </main>
  );
}
