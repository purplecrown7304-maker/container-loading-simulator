import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cargoColor } from './cargoColors';
import { runInertiaAnimation, type InertiaAnimationResult, type InertiaPhase } from './engine/inertiaSimulation';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { PhysicsScenario } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

export type InertiaScenario = Exclude<PhysicsScenario, 'settle'>;

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };

type ScenarioInfo = {
  id: InertiaScenario;
  label: string;
  forceLabel: string;
  explanation: string;
};

const SCENARIOS: ScenarioInfo[] = [
  { id: 'acceleration', label: '출발 가속', forceLabel: '← 뒤쪽 관성 0.30g', explanation: '트럭이 앞으로 출발할 때 화물이 뒤쪽으로 버티는지 확인합니다.' },
  { id: 'braking', label: '급정거', forceLabel: '→ 앞쪽 관성 0.50g', explanation: '급제동 때 화물이 문쪽/전방으로 밀리거나 넘어지는지 확인합니다.' },
  { id: 'cornering', label: '급회전', forceLabel: '→ 측면 관성 0.35g', explanation: '코너링 때 좌우 미끄러짐과 전도 위험을 확인합니다.' },
];

function currentTarget(): PhysicsTarget | undefined {
  const explicit = readPhysicsTarget();
  if (explicit) return explicit;
  const detail = (window as LoadingWindow).__containerLoadingLatestResult;
  return detail ? { mode: 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result } : undefined;
}

function phaseLabel(phase: InertiaPhase) {
  if (phase === 'settle') return '중력 정착';
  if (phase === 'force') return '관성 하중 적용';
  return '자유 감쇠';
}

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
}

function InstancedCargo({ placements, transforms }: { placements: Placement[]; transforms: Float32Array }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const helper = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((placement, index) => {
      const offset = index * 7;
      helper.position.set(transforms[offset], transforms[offset + 1], transforms[offset + 2]);
      helper.quaternion.set(transforms[offset + 3], transforms[offset + 4], transforms[offset + 5], transforms[offset + 6]);
      helper.scale.set(placement.length, placement.height, placement.width);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [helper, placements, transforms]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((placement, index) => mesh.setColorAt(index, new THREE.Color(cargoColor(placement.cargoId))));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placements]);

  return <instancedMesh ref={ref} args={[undefined, undefined, placements.length]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial roughness={0.72} metalness={0.02} />
  </instancedMesh>;
}

function InstancedSupports({ target, transforms }: { target: PhysicsTarget; transforms: Float32Array }) {
  const supports = target.supports ?? [];
  const ref = useRef<THREE.InstancedMesh>(null);
  const helper = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    supports.forEach((support, index) => {
      const offset = index * 7;
      helper.position.set(transforms[offset], transforms[offset + 1], transforms[offset + 2]);
      helper.quaternion.set(transforms[offset + 3], transforms[offset + 4], transforms[offset + 5], transforms[offset + 6]);
      helper.scale.set(support.length, support.height, support.width);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [helper, supports, transforms]);

  if (!supports.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, supports.length]} castShadow receiveShadow>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="#b88752" roughness={0.82} />
  </instancedMesh>;
}

function InertiaScene({ target, animation, frameIndex }: { target: PhysicsTarget; animation: InertiaAnimationResult; frameIndex: number }) {
  const frame = animation.frames[Math.min(frameIndex, animation.frames.length - 1)];
  const { container } = target;
  return <Canvas
    dpr={[1, 1.5]}
    shadows
    camera={{
      position: [container.length * 0.68, Math.max(4.2, container.height * 2.05), Math.max(5.8, container.width * 3.2)],
      fov: 42,
      near: 0.1,
      far: 120,
    }}
  >
    <color attach="background" args={['#eef3f8']} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[5, 10, 7]} intensity={2.1} castShadow />
    <mesh position={[0, -0.025, 0]} receiveShadow>
      <boxGeometry args={[container.length + 0.08, 0.05, container.width + 0.08]} />
      <meshStandardMaterial color="#dce4ec" roughness={0.9} />
    </mesh>
    <mesh position={[0, container.height / 2, 0]}>
      <boxGeometry args={[container.length, container.height, container.width]} />
      <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.18} depthWrite={false} />
    </mesh>
    <InstancedCargo placements={target.result.placements} transforms={frame.cargo} />
    <InstancedSupports target={target} transforms={frame.supports} />
    <OrbitControls
      makeDefault
      target={[0, container.height * 0.42, 0]}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={Math.max(22, container.length * 2.5)}
    />
  </Canvas>;
}

export default function InertiaTestTool() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PhysicsTarget | undefined>(undefined);
  const [scenario, setScenario] = useState<InertiaScenario>('acceleration');
  const [animation, setAnimation] = useState<InertiaAnimationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const generationId = useRef(0);

  const openWithCurrentTarget = useCallback(() => {
    const next = currentTarget();
    setTarget(next);
    setAnimation(null);
    setPlayhead(0);
    setPlaying(false);
    setError(next ? '' : '먼저 자동 적재를 실행해 적재 결과를 만들어 주세요.');
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_INERTIA_TEST_EVENT, openWithCurrentTarget);
    return () => window.removeEventListener(OPEN_INERTIA_TEST_EVENT, openWithCurrentTarget);
  }, [openWithCurrentTarget]);

  useEffect(() => {
    const invalidate = () => {
      if (!open) return;
      setTarget(currentTarget());
      setAnimation(null);
      setPlaying(false);
      setPlayhead(0);
      setError('적재 결과가 변경되었습니다. 새 좌표로 관성 테스트를 다시 준비합니다.');
    };
    window.addEventListener(LOADING_RESULT_EVENT, invalidate);
    window.addEventListener(PHYSICS_TARGET_EVENT, invalidate);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, invalidate);
      window.removeEventListener(PHYSICS_TARGET_EVENT, invalidate);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !target || (!target.result.placements.length && !(target.supports?.length))) return;
    const id = ++generationId.current;
    setGenerating(true);
    setGenerationProgress(0);
    setAnimation(null);
    setPlaying(false);
    setPlayhead(0);
    setError('');
    void runInertiaAnimation(
      target.container,
      target.result.placements,
      scenario,
      target.supports ?? [],
      value => { if (generationId.current === id) setGenerationProgress(Math.round(value * 100)); },
    ).then(result => {
      if (generationId.current !== id) return;
      setAnimation(result);
      setGenerating(false);
      setGenerationProgress(100);
      setPlayhead(0);
      setPlaying(true);
    }).catch(reason => {
      if (generationId.current !== id) return;
      console.error('Inertia animation failed', reason);
      setGenerating(false);
      setError('관성 애니메이션을 생성하지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도하세요.');
    });
    return () => { generationId.current += 1; };
  }, [open, scenario, target]);

  useEffect(() => {
    if (!playing || !animation) return;
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      setPlayhead(current => {
        const next = current + elapsed * animation.fps * speed;
        if (next >= animation.frames.length - 1) {
          setPlaying(false);
          return animation.frames.length - 1;
        }
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animation, playing, speed]);

  const scenarioInfo = SCENARIOS.find(item => item.id === scenario) ?? SCENARIOS[0];
  const frameIndex = animation ? Math.min(animation.frames.length - 1, Math.floor(playhead)) : 0;
  const frame = animation?.frames[frameIndex];
  const elapsedSeconds = animation && frame ? frame.step / 60 : 0;

  if (!open) return null;
  return createPortal(<div className="inertia-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="inertia-modal" role="dialog" aria-modal="true" aria-labelledby="inertia-title">
      <header className="inertia-head">
        <div>
          <span>RAPIER 3D LIVE MOTION · {target?.mode === 'pallets' ? 'PALLET MODE' : 'BOX MODE'}</span>
          <h2 id="inertia-title">관성 애니메이션 테스트</h2>
          <p>실제 물리검증과 같은 중력·충돌·마찰 조건으로 상자와 팔레트의 움직임을 눈으로 확인합니다.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="관성 테스트 닫기">닫기</button>
      </header>

      <div className="inertia-scenario-tabs" role="tablist" aria-label="관성 테스트 상황">
        {SCENARIOS.map(item => <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={scenario === item.id}
          className={scenario === item.id ? 'active' : ''}
          onClick={() => setScenario(item.id)}
        >
          <b>{item.label}</b><span>{item.forceLabel}</span>
        </button>)}
      </div>

      <div className="inertia-description"><b>{scenarioInfo.label}</b><span>{scenarioInfo.explanation}</span></div>

      <div className="inertia-stage">
        {target && animation && frame ? <>
          <InertiaScene target={target} animation={animation} frameIndex={frameIndex} />
          <div className="inertia-stage-status">
            <b>{phaseLabel(frame.phase)}</b>
            <span>{frame.phase === 'force' ? scenarioInfo.forceLabel : frame.phase === 'settle' ? '관성력 적용 전 적재물 정착 중' : '외력이 끝난 뒤 남은 흔들림 확인'}</span>
          </div>
          <div className="inertia-time">{elapsedSeconds.toFixed(2)} / {animation.simulatedSeconds.toFixed(2)} s</div>
        </> : <div className="inertia-loading">
          {generating ? <><div className="physics-spinner"/><b>Rapier 프레임 생성 중 · {generationProgress}%</b><span>상자별 위치와 회전값을 계산하고 있습니다.</span></> : <><b>관성 테스트 준비</b><span>{error || '자동 적재 후 테스트할 수 있습니다.'}</span></>}
        </div>}
      </div>

      {animation && <>
        <div className="inertia-metrics">
          <span>상자 <b>{animation.cargoCount} EA</b></span>
          {animation.supportCount > 0 && <span>팔레트 <b>{animation.supportCount} EA</b></span>}
          <span>최대 이동 <b>{mm(animation.maxHorizontalShiftM)}</b></span>
          <span>최대 기울기 <b>{animation.maxTiltDeg.toFixed(1)}°</b></span>
        </div>
        <input
          className="inertia-timeline"
          type="range"
          min="0"
          max={Math.max(0, animation.frames.length - 1)}
          step="1"
          value={frameIndex}
          aria-label="관성 테스트 재생 위치"
          onChange={event => { setPlaying(false); setPlayhead(Number(event.target.value)); }}
        />
        <div className="inertia-controls">
          <button type="button" onClick={() => { setPlayhead(0); setPlaying(true); }}>처음부터</button>
          <button type="button" className="primary" onClick={() => setPlaying(value => !value)}>{playing ? '일시정지' : '재생'}</button>
          <div className="inertia-speed" aria-label="재생 속도">
            {[0.5, 1, 2].map(value => <button key={value} type="button" className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}
          </div>
        </div>
      </>}

      <footer className="inertia-footnote">0.30g 출발 가속, 0.50g 급제동, 0.35g 횡가속은 적재안 비교용 기본 시나리오입니다. 실제 운송에서는 차량, 노면, 결박, 마찰계수와 회사/법규 기준을 별도로 확인해야 합니다.</footer>
    </section>
  </div>, document.body);
}
