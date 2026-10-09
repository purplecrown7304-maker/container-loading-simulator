import { isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { runInertiaAnimation, type InertiaAnimationResult, type InertiaPhase } from './engine/inertiaSimulation';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { PhysicsScenario } from './engine/physicsValidation';
import {
  buildSecuringUsage, createPhysicsTargetSignature, isNumericalLimitReviewTarget, minimumSecuringLevelForMode,
  readLatestInertiaCertification, securingProfileForUsage, type SecuringUsage,
} from './inertiaCertification';
import { openInertiaImprovementReport } from './inertiaReport';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { hasInspectionTarget, runStaticInspection } from './manualInspection';
import { clearPhysicsTarget, PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readTransportEquipment, TRANSPORT_EQUIPMENT_EVENT } from './transportEquipment';
import { readSecuringMaterialSettings, SECURING_MATERIAL_SETTINGS_EVENT } from './securingMaterialSettings';
import { clearInertiaCanvasPlayback, inertiaHostMatchesTarget, nextInertiaCanvasRunId, publishInertiaCanvasPlayback, readInertiaCanvasHost, useInertiaCanvasHost } from './inertiaCanvasStore';

export type InertiaScenario = Exclude<PhysicsScenario, 'settle'>;
type CompletedInertiaResults = Partial<Record<InertiaScenario, InertiaAnimationResult>>;
const SCENARIOS: { id: InertiaScenario; label: string; forceLabel: string; explanation: string }[] = [
  { id: 'acceleration', label: '출발 가속', forceLabel: '뒤 방향 관성 0.30g', explanation: '차량이 출발할 때 화물의 이동과 기울기를 계산합니다.' },
  { id: 'braking', label: '급정거', forceLabel: '앞 방향 관성 0.50g', explanation: '제동 시 화물의 앞 방향 이동과 기울기를 계산합니다.' },
  { id: 'cornering', label: '급회전', forceLabel: '옆 방향 관성 0.35g', explanation: '회전 시 화물의 옆 방향 이동과 기울기를 계산합니다.' },
];

function securingForTarget(target: PhysicsTarget): SecuringUsage {
  const latest = readLatestInertiaCertification();
  if (latest?.mode === target.mode && latest.targetSignature === createPhysicsTargetSignature(target)) return latest.securing;
  return buildSecuringUsage(target, minimumSecuringLevelForMode(target.mode));
}
function securingSummary(usage: SecuringUsage, mode: PhysicsTarget['mode']) {
  const parts: string[] = [];
  if (mode === 'pallets') {
    if (usage.bandingStraps > 0) parts.push(`밴딩 ${usage.bandingStraps}줄`);
    if (usage.cornerGuards > 0) parts.push(`코너가드 ${usage.cornerGuards}EA`);
    if (usage.wrappingLengthM > 0) parts.push(`랩핑 ${usage.wrappingLengthM.toFixed(0)}m`);
  } else if (usage.dunnageBlocks > 0) parts.push(`블로킹 ${usage.dunnageBlocks}EA`);
  if (usage.antiSlipMats > 0) parts.push(`미끄럼방지 ${usage.antiSlipMats}EA`);
  if (usage.loadBars > 0) parts.push(`로드바 ${usage.loadBars}EA`);
  return parts.join(' · ') || '추가 고정 없음';
}
const phaseLabel = (phase: InertiaPhase) => phase === 'settle' ? '중력 정착' : phase === 'force' ? '관성 하중 적용' : '잔류 움직임';
const mm = (value: number) => `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;

export default function InertiaTestTool() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PhysicsTarget>();
  const [scenario, setScenario] = useState<InertiaScenario>('acceleration');
  const [animation, setAnimation] = useState<InertiaAnimationResult | null>(null);
  const [animationRunId, setAnimationRunId] = useState(0);
  const canvasHost = useInertiaCanvasHost();
  const [completedResults, setCompletedResults] = useState<CompletedInertiaResults>({});
  const [securingUsage, setSecuringUsage] = useState<SecuringUsage | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  // Synchronous refs prevent late promises publishing between input/cancel and render.
  const generationId = useRef(0);
  const busy = useRef(false);
  const openRef = useRef(false);
  const targetRef = useRef<PhysicsTarget | undefined>(undefined);
  const scenarioRef = useRef<InertiaScenario>('acceleration');
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const stop = () => {
    generationId.current = nextInertiaCanvasRunId(); busy.current = false;
    clearInertiaCanvasPlayback();
    setGenerating(false); setGenerationProgress(0); setPlaying(false); setPlayhead(0); setAnimation(null);
  };
  const close = () => {
    openRef.current = false; stop(); setCompletedResults({}); setOpen(false);
    (opener.current?.isConnected ? opener.current : document.querySelector<HTMLButtonElement>('.header-menu-button'))?.focus();
  };
  const run = (snapshot: PhysicsTarget | undefined, nextScenario: InertiaScenario) => {
    if (!openRef.current || busy.current || !hasInspectionTarget(snapshot) || snapshot !== targetRef.current || snapshot !== readPhysicsTarget()
      || !inertiaHostMatchesTarget(readInertiaCanvasHost(), snapshot)) return;
    const id = nextInertiaCanvasRunId(); generationId.current = id;
    busy.current = true;
    clearInertiaCanvasPlayback();
    setAnimation(null); setPlaying(false); setPlayhead(0); setError(''); setGenerationProgress(0);
    setCompletedResults(current => { const next = { ...current }; delete next[nextScenario]; return next; });
    const cancelled = () => id !== generationId.current || !openRef.current || snapshot !== targetRef.current || snapshot !== readPhysicsTarget()
      || !inertiaHostMatchesTarget(readInertiaCanvasHost(), snapshot);
    try {
      if (runStaticInspection(snapshot, 'geometry').attention) throw new Error('경계·충돌 문제가 있습니다. 배치를 수정한 후 다시 실행하세요.');
      const usage = securingForTarget(snapshot);
      if (isLimitReviewTarget(snapshot) && (!isNumericalLimitReviewTarget(snapshot)
        || snapshot.result.loadedWeightKg + usage.estimatedAddedWeightKg > (snapshot.container.limitReview?.maxPayloadKg ?? snapshot.container.maxPayloadKg) + 1e-9)) {
        throw new Error('검토 시나리오 입력·형상 또는 고정재 포함 시나리오 한도를 확인하세요.');
      }
      setSecuringUsage(usage); setGenerating(true);
      publishInertiaCanvasPlayback({ runId: id, target: snapshot, securing: usage });
      void runInertiaAnimation(snapshot.container, snapshot.result.placements, nextScenario, snapshot.supports ?? [],
        progress => { if (!cancelled()) setGenerationProgress(Math.round(progress * 100)); },
        securingProfileForUsage(snapshot.mode, usage), { captureFrames: true, shouldCancel: cancelled },
      ).then(result => {
        if (cancelled()) return;
        busy.current = false; setGenerating(false); setGenerationProgress(100);
        setAnimationRunId(id); setAnimation(result); setCompletedResults(current => ({ ...current, [nextScenario]: { ...result, frames: [] } }));
        // Original models may still be loading. Keep frame zero visible until
        // the user starts playback so the clip cannot finish behind a loader.
        setPlayhead(0); setPlaying(false);
      }).catch(() => {
        if (cancelled()) return;
        busy.current = false; setGenerating(false);
        clearInertiaCanvasPlayback();
        setError('관성 애니메이션 계산에 실패했습니다. 다시 실행해 주세요.');
      });
    } catch (reason) {
      busy.current = false; setGenerating(false);
      setError(reason instanceof Error ? reason.message : '입력을 확인하고 다시 실행해 주세요.');
    }
  };
  const chooseScenario = (next: InertiaScenario) => {
    if (next === scenarioRef.current) return;
    stop(); scenarioRef.current = next; setScenario(next); run(targetRef.current, next);
  };

  useEffect(() => {
    const onOpen = () => {
      if (openRef.current) { dialog.current?.focus(); return; }
      const next = readPhysicsTarget();
      openRef.current = true; targetRef.current = next; scenarioRef.current = 'acceleration';
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTarget(next); setOpen(true); setScenario('acceleration'); setCompletedResults({}); setSecuringUsage(null);
      setError(!hasInspectionTarget(next) ? '유효한 적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.'
        : inertiaHostMatchesTarget(readInertiaCanvasHost(), next) ? '' : '자동 적재 단계의 3D 화면에서 실행하세요.');
      run(next, 'acceleration');
    };
    const invalidate = (next?: PhysicsTarget) => {
      stop(); targetRef.current = next; setTarget(next); setCompletedResults({}); setSecuringUsage(null);
      setError('입력 또는 적재 결과가 변경되어 이전 애니메이션을 폐기했습니다. 자동 적재 결과를 확인하고 다시 실행하세요.');
    };
    const onTarget = () => invalidate(readPhysicsTarget());
    const onResult = (event: Event) => {
      const next = readPhysicsTarget();
      invalidate(next?.result === (event as CustomEvent).detail?.result ? next : undefined);
    };
    const settingsKey = () => JSON.stringify([readTransportEquipment(), readSecuringMaterialSettings()]);
    let previousSettings = settingsKey();
    const onSettings = () => {
      const next = settingsKey();
      if (next === previousSettings) return;
      previousSettings = next; clearPhysicsTarget();
    };
    const onBack = () => { if (openRef.current) close(); };
    window.addEventListener(OPEN_INERTIA_TEST_EVENT, onOpen);
    window.addEventListener(PHYSICS_TARGET_EVENT, onTarget);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onSettings);
    window.addEventListener(SECURING_MATERIAL_SETTINGS_EVENT, onSettings);
    window.addEventListener('popstate', onBack);
    return () => {
      generationId.current = nextInertiaCanvasRunId(); openRef.current = false; busy.current = false;
      clearInertiaCanvasPlayback();
      window.removeEventListener(OPEN_INERTIA_TEST_EVENT, onOpen);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onTarget);
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onSettings);
      window.removeEventListener(SECURING_MATERIAL_SETTINGS_EVENT, onSettings);
      window.removeEventListener('popstate', onBack);
    };
  }, []);
  useEffect(() => {
    if (open) { dialog.current?.focus(); canvasHost?.element.parentElement?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
  }, [open, canvasHost]);
  useEffect(() => {
    if (!openRef.current || inertiaHostMatchesTarget(canvasHost, targetRef.current)) return;
    stop(); setCompletedResults({});
    if (targetRef.current) setError('자동 적재 단계의 3D 화면에서 실행하세요.');
  }, [canvasHost]);
  useEffect(() => {
    if (!open || !playing || !animation || animation.frames.length === 0) return;
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, (now - previous) / 1000); previous = now;
      setPlayhead(current => {
        const next = current + elapsed * animation.fps * speed;
        if (next >= animation.frames.length - 1) { setPlaying(false); return animation.frames.length - 1; }
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animation, open, playing, speed]);

  const scenarioInfo = SCENARIOS.find(item => item.id === scenario) ?? SCENARIOS[0];
  const frameIndex = animation?.frames.length ? Math.min(animation.frames.length - 1, Math.floor(playhead)) : 0;
  const frame = animation?.frames[frameIndex];
  const testedCount = Object.keys(completedResults).length;
  const ready = hasInspectionTarget(target) && inertiaHostMatchesTarget(canvasHost, target);
  useEffect(() => {
    if (!openRef.current || !frame || !target || !securingUsage || animationRunId !== generationId.current || target !== targetRef.current) return;
    publishInertiaCanvasPlayback({ runId: animationRunId, target, securing: securingUsage, frame });
  }, [frame, target, securingUsage, animationRunId, canvasHost]);
  const openReport = () => {
    if (!target || target !== readPhysicsTarget() || testedCount === 0) return;
    if (!openInertiaImprovementReport(target, completedResults)) setError('팝업이 차단되어 개선 보고서를 열지 못했습니다.');
  };
  if (!open) return null;
  const inline = Boolean(canvasHost);
  const conditions = <>
    <div className="inertia-description"><b>{scenarioInfo.label}</b><span>{scenarioInfo.explanation}</span></div>
    {target && securingUsage && <div className="inertia-description"><b>계산 가정 · {securingUsage.levelLabel}</b><span>{securingSummary(securingUsage, target.mode)}</span></div>}
  </>;
  const metrics = animation && frame && <div className="inertia-metrics"><span>화물 <b>{animation.cargoCount} EA</b></span>
    {animation.supportCount > 0 && <span>파렛트 <b>{animation.supportCount} EA</b></span>}
    <span>최대 이동 <b>{mm(animation.maxHorizontalShiftM)}</b></span><span>최대 기울기 <b>{animation.maxTiltDeg.toFixed(1)}°</b></span>
    {securingUsage && <span>고정재 <b>{securingUsage.levelLabel}</b></span>}<span>계산한 상황 <b>{testedCount} / 3</b></span></div>;
  const caution = <footer className="inertia-footnote">0.30g 출발 가속, 0.50g 급정거, 0.35g 급회전은 비교용 기본 상황입니다. Rapier 강체 시뮬레이션이며 실제 마찰·체결 성능과 도로 조건을 모두 재현하지 않습니다. 실제 운송 안전 인증이 아니며 현장 고정 상태를 별도로 확인해야 합니다. 입력 변경·닫기·뒤로 가기는 실행 중 계산과 재생 결과를 폐기합니다.</footer>;
  const panel = <section ref={dialog} tabIndex={-1} className={inline ? 'inertia-modal inertia-inline-panel' : 'inertia-modal'} role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : true} aria-labelledby="inertia-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (!inline && event.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="inertia-head"><div>
        <span>3D INERTIA ANIMATION · {target?.mode === 'pallets' ? 'PALLET MODE' : 'BOX MODE'}</span>
        <h2 id="inertia-title">관성 애니메이션 테스트</h2>
        <p>현재 적재 결과의 움직임을 계산하고 3D로 재생합니다. 계산상 비교이며 실제 운송 안전 인증이 아닙니다.</p>
      </div><div className="inertia-head-actions">
        {!inline && testedCount > 0 && <button type="button" className="inertia-report-action" onClick={openReport}>계산 결과·개선 보고서 <b>{testedCount}/3</b></button>}
        <button type="button" onClick={close} aria-label="관성 테스트 닫기">닫기</button>
      </div></header>
      {isLimitReviewTarget(target ?? undefined) && <p className="inertia-footnote" role="alert">{LIMIT_REVIEW_WARNING}</p>}
      <div className="inertia-scenario-tabs" role="tablist" aria-label="관성 테스트 상황">
        {SCENARIOS.map(item => <button key={item.id} type="button" role="tab" aria-selected={scenario === item.id}
          className={scenario === item.id ? 'active' : ''} onClick={() => chooseScenario(item.id)}>
          <b>{item.label}</b><span>{item.forceLabel}{completedResults[item.id] ? ' · 계산 완료' : ''}</span>
        </button>)}
      </div>
      {!inline && conditions}
      <div className="inertia-controls">
        {generating ? <button type="button" onClick={() => { stop(); setError('계산을 취소했습니다. 결과는 저장되지 않았습니다.'); }}>관성 계산 취소</button>
          : <button type="button" disabled={!ready} onClick={() => run(targetRef.current, scenarioRef.current)}>현재 상황 다시 계산</button>}
        {animation && <span>재생을 눌러 3D 움직임을 확인하세요.</span>}
      </div>
      {error && <p role="status">{error}</p>}
      {generating && <div className="inertia-loading"><b role="status">Rapier 프레임 계산 중 · {generationProgress}%</b><progress max={100} value={generationProgress} aria-label="관성 프레임 계산 진행률" /></div>}
      {animation && frame && <>
        <div className="inertia-playback-status">
          <div className="inertia-stage-status"><b>{phaseLabel(frame.phase)}</b><span>{frame.phase === 'force' ? scenarioInfo.forceLabel : frame.phase === 'settle' ? '관성 적용 전 적재물 정착 중' : '외력 제거 후 잔류 움직임 확인'}</span></div>
          <div className="inertia-time">{(frame.step / 60).toFixed(2)} / {animation.simulatedSeconds.toFixed(2)} s</div>
        </div>
        {!inline && metrics}
        <input className="inertia-timeline" data-view-only="true" type="range" min="0" max={animation.frames.length - 1} step="1" value={frameIndex}
          aria-label="관성 테스트 재생 위치" onChange={event => { setPlaying(false); setPlayhead(Number(event.target.value)); }} />
        <div className="inertia-controls">
          <button type="button" onClick={() => { setPlayhead(0); setPlaying(true); }}>처음부터</button>
          <button type="button" className="primary" onClick={() => { if (!playing && frameIndex === animation.frames.length - 1) setPlayhead(0); setPlaying(value => !value); }}>{playing ? '일시정지' : '재생'}</button>
          {!inline && <button type="button" className="inertia-report-control" onClick={openReport}>계산 결과·개선 보고서</button>}
          <div className="inertia-speed" aria-label="재생 속도">{[0.5, 1, 2].map(value => <button key={value} type="button" aria-pressed={speed === value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}배</button>)}</div>
        </div>
      </>}
      {inline ? <details className="inertia-calculation-details"><summary>계산 조건·결과·주의사항</summary>{conditions}{metrics}{caution}
        {testedCount > 0 && <button type="button" className="inertia-report-control" onClick={openReport}>계산 결과·개선 보고서</button>}
      </details> : caution}
    </section>;
  return createPortal(inline ? panel : <div className="inertia-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>{panel}</div>, canvasHost?.element ?? document.body);
}
