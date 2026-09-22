import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContainerSpec, LoadingResult } from './engine/types';
import { selectPlacement, PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { readStoredState } from './storage';
import { unityPlan, unityFrame, type UnityCommand, type UnitySceneOptions } from './unityProtocol';
import type { CargoItem } from './engine/types';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { readTransportEquipment } from './transportEquipment';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import WeightDistributionPanel from './WeightDistributionPanel';
import './weight-distribution.css';
import './unity-viewer.css';

type Props = UnitySceneOptions & {
  container: ContainerSpec; result: LoadingResult; cargo?: CargoItem[]; preview?: boolean;
  title?: string; syncSelection?: boolean; frameData?: InertiaAnimationFrame;
  onCargoSelect?: (index: number) => void; onSupportSelect?: (index: number) => void;
  weightView?: boolean; showCg?: boolean; view?: string;
};
export default function UnityLoadingViewer({ container, result, cargo, preview = false, title = '적재 시뮬레이터', syncSelection = false, supports, securing, geometry, vehicle, frameData, onCargoSelect, onSupportSelect, weightView, showCg = true, view }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [weight, setWeight] = useState(false), [cg, setCg] = useState(true), [cell, setCell] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('free');
  const [cut, setCut] = useState(100), [shell, setShell] = useState(true), [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(result.placements.length), [selected, setSelected] = useState<number | null>(null);
  const [applied, setApplied] = useState(-1);
  const revision = useRef(0);
  const plan = useMemo(() => unityPlan(container, result, ++revision.current, cargo ?? readStoredState()?.cargo, { supports, securing, geometry: geometry ?? readTransportEquipment().geometry, vehicle: vehicle ?? (geometry ? false : readTransportEquipment().category === 'truck') }), [container, result, cargo, supports, securing, geometry, vehicle]);
  const weightOn = weightView ?? weight;
  const analysis = useMemo(() => analyzeWeightDistribution(container, result, 20, 8), [container, result]);
  const current = useRef({ plan, cut, shell, weightOn, cg, showCg, view, activeView, syncSelection, onCargoSelect, onSupportSelect });
  current.current = { plan, cut, shell, weightOn, cg, showCg, view, activeView, syncSelection, onCargoSelect, onSupportSelect };
  const post = useCallback((type: string, payload: unknown) => frame.current?.contentWindow?.postMessage({ source: 'cargo-web', type, payload }, window.location.origin), []);
  const command = useCallback((payload: UnityCommand) => post('command', payload), [post]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.source !== 'cargo-unity-host') return;
      const value = event.data.payload;
      if (value?.type === 'ready') { setReady(true); setError(''); }
      if (value?.type === 'progress') setProgress(Math.round(Math.max(0, Math.min(1, Number(value.value) || 0)) * 100));
      if (value?.type === 'error') setError(String(value.message));
      if (value?.type === 'planApplied' && value.revision === current.current.plan.revision) {
        setApplied(value.revision); setStep(current.current.plan.placements.length); setPlaying(false); setSelected(null); setCell(null);
        command({ action: 'cut', value: current.current.cut }); command({ action: 'shell', value: current.current.shell ? 1 : 0 });
        command({ action: 'weight', value: +current.current.weightOn }); command({ action: 'cg', value: +(current.current.cg && current.current.showCg) });
        const view = current.current.view ?? current.current.activeView;
        command({ action: 'view', view: view === 'rear' ? 'door' : view });
      }
      if (value?.revision !== current.current.plan.revision) return;
      if (value?.type === 'selection' && Number.isInteger(value.index)) {
        const index = value.index === -1 ? null : value.index;
        if (index !== null && (index < 0 || index >= current.current.plan.placements.length)) return;
        setSelected(index); if (current.current.syncSelection) selectPlacement(index); if (index !== null) current.current.onCargoSelect?.(index);
      }
      if (value?.type === 'support' && Number.isInteger(value.index) && current.current.plan.supports[value.index]) current.current.onSupportSelect?.(value.index);
      if (value?.type === 'cell') setCell(Number.isInteger(value.index) && current.current.plan.cells[value.index] ? value.index : null);
      if (value?.type === 'step' && Number.isInteger(value.value)) { setStep(value.value); if (value.value >= current.current.plan.placements.length) setPlaying(false); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [command]);
  useEffect(() => { if (ready) post('plan', plan); }, [ready, plan, post]);
  useEffect(() => {
    if (!syncSelection) return;
    const receive = (event: Event) => { const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null; if (index !== null && !result.placements[index]) return; setSelected(index); if (ready) command({ action: 'select', value: index ?? -1 }); };
    window.addEventListener(PLACEMENT_SELECT_EVENT, receive);return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, receive);
  }, [syncSelection, ready, result.placements, command]);
  useEffect(() => { if (ready || error) return; const timer = window.setTimeout(() => setError('Unity 로딩 시간이 초과되었습니다. 다시 시도해 주세요.'), 120000); return () => window.clearTimeout(timer); }, [ready, error, attempt]);
  useEffect(() => {
    if (!ready || applied !== plan.revision || !frameData) return;
    const payload = unityFrame(frameData, plan.revision, plan.placements.length, plan.supports.length);
    if (payload) post('frame', payload);
  }, [ready, applied, plan, frameData, post]);
  useEffect(() => { if (ready) { command({ action: 'weight', value: +weightOn }); command({ action: 'cg', value: +(showCg && cg) }); } }, [ready, weightOn, showCg, cg, command]);
  useEffect(() => { if (ready && view) command({ action: 'view', view: view === 'rear' ? 'door' : view }); }, [ready, view, command]);
  const retry = () => { setReady(false); setApplied(-1); setError(''); setProgress(0); setAttempt(x => x + 1); };
  const selectedCell = cell === null ? undefined : analysis.floor.cells[cell];
  const selectedBox = selected === null ? undefined : result.placements[selected];
  const count = result.placements.length;
  return <section className={`unity-viewer ${preview ? 'unity-preview' : ''}`} aria-label={`Unity ${title}`} data-unity-count={result.placements.length} data-unity-supports={plan.supports.length} data-unity-ready={ready} data-unity-applied={applied === plan.revision}>
    <div className="unity-toolbar"><div><b>{title}</b><span className="studio-live-badge"><i/>UNITY 3D</span></div><div className="unity-view-buttons">{[['free','입체'],['top','상단'],['door','문쪽'],['side','측면']].map(([view,label]) => <button key={view} aria-pressed={activeView === view} disabled={!ready} onClick={() => { setActiveView(view); command({ action: 'view', view }); }}>{label}</button>)}<button disabled={!ready} aria-pressed={shell} onClick={() => { setShell(!shell);command({ action: 'shell', value: shell ? 0 : 1 }); }}>{shell ? '외벽 숨기기' : '외벽 표시'}</button>{!preview && weightView === undefined && <button disabled={!ready || !count} aria-pressed={weightOn} onClick={() => setWeight(!weight)}>3D 무게분포</button>}{weightOn && <button aria-pressed={cg} onClick={() => setCg(!cg)}>CG {cg ? 'ON' : 'OFF'}</button>}</div></div>
    <div className="unity-stage">
      <iframe key={attempt} ref={frame} src="/unity-viewer/host.html" title={`Unity 3D 캔버스 · ${title}`} allow="fullscreen" />
      {!ready && !error && <div className="unity-loading" role="status"><b>Unity 엔진 준비 중</b><progress max="100" value={progress}/><span>{progress}%</span></div>}
      {error && <div className="unity-loading" role="alert"><b>Unity를 실행할 수 없습니다</b><span>{error}</span><button onClick={retry}>Unity 다시 시도</button></div>}
      {ready && <div className="unity-hint">드래그 회전 · 휠 확대 · 우클릭 이동{weightOn ? ' · 격자 클릭: 하중 확인' : ' · 화물 클릭: 정보 확인'}</div>}
      {!weightOn && selectedBox && <div className="unity-inspector"><b>{(cargo ?? readStoredState()?.cargo)?.find(item => item.id === selectedBox.cargoId)?.name ?? selectedBox.cargoId}</b><span>{selectedBox.cargoId}</span><span>{selectedBox.length.toFixed(2)} × {selectedBox.width.toFixed(2)} × {selectedBox.height.toFixed(2)} m</span><span>{selectedBox.weightKg.toFixed(1)} kg · {selectedBox.rotated ? '90° 회전' : '기본 방향'}</span></div>}
      {weightOn && selectedCell && <div className="unity-inspector"><b>R{selectedCell.row + 1} · C{selectedCell.column + 1}</b><span>{selectedCell.loadKg.toFixed(1)} kg · {selectedCell.kgPerM2.toFixed(0)} kg/m²</span></div>}
      {weightOn && <details className="unity-weight-details"><summary>무게분포 수치 · 박스 중량 기준</summary><WeightDistributionPanel analysis={analysis}/></details>}
    </div>
    {!preview && !frameData && !weightOn && <div className="unity-controls"><label>높이 단면<input data-view-only="true" aria-label="Unity 높이 단면" type="range" min="1" max="100" value={cut} disabled={!ready} onChange={e => { const value = Number(e.target.value);setCut(value);command({ action: 'cut', value }); }}/><output>{cut}%</output></label><button disabled={!ready || !count} onClick={() => { command({ action: 'play', value: playing ? 0 : 1 });setPlaying(!playing); }}>{playing ? '일시정지' : '적재 순서 재생'}</button><label>순서<input data-view-only="true" aria-label="Unity 적재 순서" type="range" min="0" max={count} value={step} disabled={!ready || !count} onChange={e => { const value = Number(e.target.value);setStep(value);setPlaying(false);command({ action: 'step', value }); }}/><output>{step} / {count}</output></label></div>}
    <div className="unity-summary"><span>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</span><span>{count} EA · {result.loadedWeightKg.toLocaleString()} kg{plan.supports.length ? ` · 팔레트 ${plan.supports.length}개` : ''}</span>{!preview && <span>{result.validationIssues.length ? `규칙 위반 ${result.validationIssues.length}건 · 빨간 박스 확인` : count ? '배치 규칙 검사 통과' : '자동 적재 실행 대기'}</span>}</div>
    {!preview && !frameData && <small className="unity-sequence-note">배치 순서 시각화 · 현장 작업 순서와 안전 판정은 검증표를 확인하세요.</small>}
  </section>;
}
