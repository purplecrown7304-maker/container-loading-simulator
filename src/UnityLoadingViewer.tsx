import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContainerSpec, LoadingResult } from './engine/types';
import { selectPlacement, PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { readStoredState } from './storage';
import { unityPlan, type UnityCommand } from './unityProtocol';
import './unity-viewer.css';

type Props = { container: ContainerSpec; result: LoadingResult; preview?: boolean; onFallback?: () => void };
export default function UnityLoadingViewer({ container, result, preview = false, onFallback }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const [activeView, setActiveView] = useState('free');
  const [cut, setCut] = useState(100), [shell, setShell] = useState(true), [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(result.placements.length), [selected, setSelected] = useState<number | null>(null);
  const [applied, setApplied] = useState(-1);
  const revision = useRef(0);
  const plan = useMemo(() => unityPlan(container, result, ++revision.current, readStoredState()?.cargo), [container, result]);
  const current = useRef({ plan, cut, shell }); current.current = { plan, cut, shell };
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
        setApplied(value.revision); setStep(current.current.plan.placements.length); setPlaying(false); setSelected(null);
        command({ action: 'cut', value: current.current.cut }); command({ action: 'shell', value: current.current.shell ? 1 : 0 });
      }
      if (value?.type === 'selection' && Number.isInteger(value.index)) {
        const index = value.index === -1 ? null : value.index;
        if (index !== null && (index < 0 || index >= current.current.plan.placements.length)) return;
        setSelected(index); selectPlacement(index);
      }
      if (value?.type === 'step' && Number.isInteger(value.value)) { setStep(value.value); if (value.value >= current.current.plan.placements.length) setPlaying(false); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [command]);
  useEffect(() => { if (ready) post('plan', plan); }, [ready, plan, post]);
  useEffect(() => {
    const receive = (event: Event) => { const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null; if (index !== null && !result.placements[index]) return; setSelected(index); if (ready) command({ action: 'select', value: index ?? -1 }); };
    window.addEventListener(PLACEMENT_SELECT_EVENT, receive);return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, receive);
  }, [ready, result.placements, command]);
  useEffect(() => { if (ready || error) return; const timer = window.setTimeout(() => setError('Unity 로딩 시간이 초과되었습니다. 새로고침하거나 기존 3D 보기를 선택하세요.'), 120000); return () => window.clearTimeout(timer); }, [ready, error]);
  const selectedBox = selected === null ? undefined : result.placements[selected];
  const count = result.placements.length;
  return <section className={`unity-viewer ${preview ? 'unity-preview' : ''}`} aria-label="Unity 적재 공간" data-unity-ready={ready} data-unity-applied={applied === plan.revision}>
    <div className="unity-toolbar"><div><b>{preview ? '공간 미리보기' : '적재 시뮬레이터'}</b><span className="studio-live-badge"><i/>LIVE 3D</span></div><div className="unity-view-buttons">{[['free','입체'],['top','상단'],['door','문쪽'],['side','측면']].map(([view,label]) => <button key={view} aria-pressed={activeView === view} disabled={!ready} onClick={() => { setActiveView(view); command({ action: 'view', view }); }}>{label}</button>)}<button disabled={!ready} aria-pressed={shell} onClick={() => { setShell(!shell);command({ action: 'shell', value: shell ? 0 : 1 }); }}>{shell ? '외벽 숨기기' : '외벽 표시'}</button>{!preview && onFallback && <button onClick={onFallback}>기존 3D·무게분포</button>}</div></div>
    <div className="unity-stage">
      <iframe ref={frame} src="/unity-viewer/host.html" title="Unity 3D 캔버스" allow="fullscreen" />
      {!ready && !error && <div className="unity-loading" role="status"><b>Unity 엔진 준비 중</b><progress max="100" value={progress}/><span>{progress}%</span></div>}
      {error && <div className="unity-loading" role="alert"><b>Unity를 실행할 수 없습니다</b><span>{error}</span>{onFallback && <button onClick={onFallback}>기존 3D 보기</button>}</div>}
      {ready && <div className="unity-hint">드래그 회전 · 휠 확대 · 우클릭 이동{!preview && ' · 박스 클릭 선택'}</div>}
      {selectedBox && <div className="unity-inspector"><b>{selectedBox.cargoId}</b><span>{selectedBox.length.toFixed(2)} × {selectedBox.width.toFixed(2)} × {selectedBox.height.toFixed(2)} m</span><span>{selectedBox.weightKg.toFixed(1)} kg · {selectedBox.rotated ? '90° 회전' : '기본 방향'}</span></div>}
    </div>
    {!preview && <div className="unity-controls"><label>높이 단면<input data-view-only="true" aria-label="Unity 높이 단면" type="range" min="1" max="100" value={cut} disabled={!ready} onChange={e => { const value = Number(e.target.value);setCut(value);command({ action: 'cut', value }); }}/><output>{cut}%</output></label><button disabled={!ready || !count} onClick={() => { command({ action: 'play', value: playing ? 0 : 1 });setPlaying(!playing); }}>{playing ? '일시정지' : '적재 순서 재생'}</button><label>순서<input data-view-only="true" aria-label="Unity 적재 순서" type="range" min="0" max={count} value={step} disabled={!ready || !count} onChange={e => { const value = Number(e.target.value);setStep(value);setPlaying(false);command({ action: 'step', value }); }}/><output>{step} / {count}</output></label></div>}
    <div className="unity-summary"><span>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</span><span>{preview ? `내부 ${(container.length * container.width * container.height).toFixed(2)} m³` : `적재 ${count} EA · ${result.loadedWeightKg.toLocaleString()} kg`}</span>{!preview && <span>{result.validationIssues.length ? `규칙 위반 ${result.validationIssues.length}건 · 빨간 박스 확인` : count ? '적재 규칙 검사 통과' : '자동 적재 실행 대기'}</span>}</div>
    {!preview && <small className="unity-sequence-note">재생은 계산된 배치 순서의 시각화입니다. 현장 작업 순서·동적 안전 판정은 기존 검사 결과를 확인하세요.</small>}
  </section>;
}
