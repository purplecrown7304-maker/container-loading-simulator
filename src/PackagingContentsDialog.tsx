import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import { Color, InstancedMesh, Object3D } from 'three';
import { packagingContentsModel, type PackagingInspection } from './packagingContentsModel';
import './packaging-contents.css';

type Model = NonNullable<ReturnType<typeof packagingContentsModel>>;
type View = 'orbit' | 'top' | 'front';
const mm = (v: number) => Math.round(v * 1000).toLocaleString();
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">3D 화면을 준비하지 못했습니다. 창을 닫고 다시 열어 주세요.</p> : this.props.children; }
}
function CameraView({ view, reset }: { view: View; reset: number }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
    camera.position.set(...(view === 'top' ? [0, 2.8, 0] : view === 'front' ? [0, 0.4, 2.8] : [1.8, 1.5, 2]) as [number, number, number]);
    camera.lookAt(0, 0, 0); (controls as { target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null)?.target?.set(0, 0, 0);
    (controls as { update?: () => void } | null)?.update?.(); invalidate();
  }, [view, reset, camera, controls, invalidate]);
  return null;
}
function Products({ model, scale }: { model: Model; scale: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const { invalidate } = useThree();
  const edges = useMemo(() => {
    const pairs = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
    const vertices: number[] = [];
    for (const center of model.positions) {
      const corners = Array.from({ length: 8 }, (_, i) => center.map((v, axis) => v + ((i >> axis & 1) ? 1 : -1) * model.size[axis] / 2));
      for (const pair of pairs) for (const i of pair) {
        const [x, y, z] = corners[i];
        vertices.push((x - model.inner[0] / 2) / scale, (z - model.inner[2] / 2) / scale, (y - model.inner[1] / 2) / scale);
      }
    }
    return new Float32Array(vertices);
  }, [model, scale]);
  useLayoutEffect(() => {
    const object = new Object3D();
    model.positions.forEach(([x, y, z], i) => {
      object.position.set((x - model.inner[0] / 2) / scale, (z - model.inner[2] / 2) / scale, (y - model.inner[1] / 2) / scale);
      object.updateMatrix(); mesh.current!.setMatrixAt(i, object.matrix);
      mesh.current!.setColorAt(i, new Color(i % 2 ? '#87b7df' : '#bdd9ef'));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    mesh.current!.computeBoundingSphere(); invalidate();
  }, [model, scale, invalidate]);
  return <><instancedMesh ref={mesh} args={[undefined, undefined, model.shown]}><boxGeometry args={[model.size[0] / scale, model.size[2] / scale, model.size[1] / scale]} /><meshStandardMaterial color="#ffffff" roughness={0.65} /></instancedMesh><lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[edges, 3]}/></bufferGeometry><lineBasicMaterial color="#54728e"/></lineSegments></>;
}
export default function PackagingContentsDialog({ inspection, onClose }: { inspection: PackagingInspection; onClose: () => void }) {
  const [view, setView] = useState<View>('orbit');
  const [reset, setReset] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const model = useMemo(() => packagingContentsModel(inspection), [inspection]);
  const { product, assignment } = inspection;
  const scale = Math.max(assignment.outerLength, assignment.outerWidth, assignment.outerHeight);
  const [l, w, h] = [assignment.innerLength / scale, assignment.innerWidth / scale, assignment.innerHeight / scale];
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button,[tabindex="0"]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current!.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current!.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus(); };
  }, []);
  return createPortal(<div className="packaging-contents-backdrop" data-view-only="true" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} className="packaging-contents-dialog" role="dialog" aria-modal="true" aria-label="박스 내부 제품 보기" tabIndex={-1}>
      <header><div><small>BOX CONTENTS</small><h2>{product.name}</h2><p>{assignment.boxName} · {assignment.boxId}</p></div><button type="button" data-view-only="true" aria-label="박스 내부 보기 닫기" onClick={onClose}>닫기 ×</button></header>
      <div className="packaging-contents-metrics"><span>이 박스의 제품 <b>{inspection.units.toLocaleString()} EA</b></span><span>박스 내경 <b>{mm(assignment.innerLength)} × {mm(assignment.innerWidth)} × {mm(assignment.innerHeight)} mm</b></span><span>제품 규격 <b>{mm(product.length)} × {mm(product.width)} × {mm(product.height)} mm</b></span></div>
      {model ? <><div className="packaging-contents-controls" role="group" aria-label="박스 내부 시점"><button data-view-only="true" aria-pressed={view === 'orbit'} onClick={() => setView('orbit')}>입체</button><button data-view-only="true" aria-pressed={view === 'top'} onClick={() => setView('top')}>상단</button><button data-view-only="true" aria-pressed={view === 'front'} onClick={() => setView('front')}>정면</button><button data-view-only="true" onClick={() => { setView('orbit'); setReset(v => v + 1); }}>시점 초기화</button><span>{model.layers}단 · 완충 여유 {mm(model.padding)} mm</span></div>
      <div className="packaging-contents-canvas" aria-label="열린 박스 안 제품 3D 모형"><SceneBoundary><Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [1.8, 1.5, 2], fov: 38 }}><color attach="background" args={['#edf2f6']} /><ambientLight intensity={1.7}/><directionalLight position={[3, 5, 4]} intensity={2}/>
        <mesh position={[0, -h / 2 - 0.01, 0]}><boxGeometry args={[l + 0.02, 0.02, w + 0.02]}/><meshStandardMaterial color="#b98d54"/></mesh>
        <mesh position={[0, h / 2 + 0.08, -w / 2 - 0.13]} rotation={[-0.55, 0, 0]}><boxGeometry args={[l + 0.02, 0.012, 0.3]}/><meshStandardMaterial color="#cba977"/></mesh>
        <mesh position={[0, 0, -w / 2 - 0.01]}><boxGeometry args={[l + 0.02, h, 0.02]}/><meshStandardMaterial color="#cba977" transparent opacity={0.45} depthWrite={false}/></mesh>
        <mesh position={[-l / 2 - 0.01, 0, 0]}><boxGeometry args={[0.02, h, w]}/><meshStandardMaterial color="#cba977" transparent opacity={0.35} depthWrite={false}/></mesh>
        <mesh position={[l / 2 + 0.01, 0, 0]}><boxGeometry args={[0.02, h, w]}/><meshStandardMaterial color="#cba977" transparent opacity={0.15} depthWrite={false}/></mesh>
        <mesh><boxGeometry args={[l, h, w]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/><Edges color="#99723e"/></mesh>
        <Products model={model} scale={scale}/><OrbitControls makeDefault target={[0, 0, 0]} minDistance={0.5} maxDistance={6}/><CameraView view={view} reset={reset}/>
      </Canvas></SceneBoundary></div><p className="packaging-contents-note">드래그 회전 · 휠 확대 · 뚜껑과 앞면을 열어 내부를 표시합니다. 제품은 등록 치수에 따른 형상이며 내부 배치는 등록 조건에 따른 표시 예시입니다.{model.shown < model.units ? ` 화면에는 ${model.shown} / ${model.units.toLocaleString()}개를 표시합니다.` : ''}</p></> : <p role="alert">제품 치수·방향·내부 적층 조건으로 이 수량을 표시할 수 없습니다. 박스와 제품 등록값을 확인하세요.</p>}
    </div></div>, document.body);
}
