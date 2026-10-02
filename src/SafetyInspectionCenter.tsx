import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { buildSecuringUsage, createPhysicsTargetSignature, minimumSecuringLevelForMode, readLatestInertiaCertification, securingProfileForUsage } from './inertiaCertification';
import { hasInspectionTarget, INSPECTIONS, type InspectionFinding, type InspectionKind, type InspectionResponse } from './manualInspection';
import { clearPhysicsTarget, PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readTransportEquipment, TRANSPORT_EQUIPMENT_EVENT } from './transportEquipment';
import { readSecuringMaterialSettings, SECURING_MATERIAL_SETTINGS_EVENT } from './securingMaterialSettings';
import './safety-inspection-center.css';

export const OPEN_SAFETY_INSPECTION_CENTER_EVENT = 'container-loading:open-safety-inspection-center';
export function openSafetyInspectionCenter(kind?: InspectionKind) { window.dispatchEvent(new CustomEvent(OPEN_SAFETY_INSPECTION_CENTER_EVENT, { detail: { kind } })); }
type Record = { state: 'running' | 'done' | 'cancelled' | 'error'; progress: number; result?: InspectionFinding; error?: string };

export default function SafetyInspectionCenter() {
  const [open, setOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<InspectionKind | undefined>();
  const [target, setTarget] = useState<PhysicsTarget | undefined>(() => readPhysicsTarget());
  const [records, setRecords] = useState<Partial<{ [K in InspectionKind]: Record }>>({});
  const [message, setMessage] = useState('점검할 항목을 선택해 실행하세요.');
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);
  const active = useRef<InspectionKind | null>(null);
  const targetRef = useRef(target);
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const stop = () => { runId.current++; worker.current?.terminate(); worker.current = null; active.current = null; };
  const close = () => {
    stop(); setRecords({}); setOpen(false);
    const returnFocus = opener.current?.isConnected ? opener.current : document.querySelector<HTMLButtonElement>('.header-menu-button');
    returnFocus?.focus();
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      stop(); setRecords({});
      const requested = (event as CustomEvent<{ kind?: InspectionKind }>).detail?.kind;
      setSelectedKind(INSPECTIONS.some(item => item.id === requested) ? requested : undefined);
      const next = readPhysicsTarget(); targetRef.current = next; setTarget(next);
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMessage('점검할 항목을 선택해 실행하세요.'); setOpen(true);
    };
    const invalidate = (next?: PhysicsTarget) => {
      stop(); targetRef.current = next; setTarget(next); setRecords({});
      setMessage('입력 또는 적재 결과가 변경되어 이전 점검을 폐기했습니다. 현재 결과로 다시 실행하세요.');
    };
    const onTarget = () => invalidate(readPhysicsTarget());
    const onResult = (e: Event) => {
      const next = readPhysicsTarget();
      invalidate(next?.result === (e as CustomEvent).detail?.result ? next : undefined);
    };
    // Adapters re-announce unchanged equipment after applying a loading result.
    // Only a changed calculation input invalidates that just-published target.
    const settingsKey = () => JSON.stringify([readTransportEquipment(), readSecuringMaterialSettings()]);
    let previousSettings = settingsKey();
    const onSettings = () => {
      const nextSettings = settingsKey();
      if (nextSettings === previousSettings) return;
      previousSettings = nextSettings; clearPhysicsTarget(); invalidate();
    };
    window.addEventListener(OPEN_SAFETY_INSPECTION_CENTER_EVENT, onOpen);
    window.addEventListener(PHYSICS_TARGET_EVENT, onTarget);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onSettings);
    window.addEventListener(SECURING_MATERIAL_SETTINGS_EVENT, onSettings);
    return () => {
      stop();
      window.removeEventListener(OPEN_SAFETY_INSPECTION_CENTER_EVENT, onOpen);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onTarget);
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onSettings);
      window.removeEventListener(SECURING_MATERIAL_SETTINGS_EVENT, onSettings);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const onBack = () => close();
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [open]);

  const run = (kind: InspectionKind) => {
    if (worker.current || !hasInspectionTarget(targetRef.current)) return;
    const snapshot = targetRef.current;
    if (snapshot !== readPhysicsTarget()) { setTarget(undefined); targetRef.current = undefined; setRecords({}); return; }
    const id = ++runId.current;
    active.current = kind;
    setRecords(prev => ({ ...prev, [kind]: { state: 'running', progress: 0 } }));
    try {
      const w = new Worker(new URL('./manualInspection.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      const finish = (data: InspectionResponse) => {
        if (id !== runId.current || snapshot !== targetRef.current || snapshot !== readPhysicsTarget()) return;
        setRecords(prev => ({ ...prev, [kind]: { ...data, state: data.error ? 'error' : data.result ? 'done' : 'running' } }));
        if (data.result || data.error) stop();
      };
      w.onmessage = (event: MessageEvent<InspectionResponse>) => finish(event.data);
      w.onerror = () => finish({ progress: 0, error: '계산 작업을 실행하지 못했습니다. 다시 시도하세요.' });
      const latest = readLatestInertiaCertification();
      const usage = latest?.targetSignature === createPhysicsTargetSignature(snapshot) ? latest.securing : buildSecuringUsage(snapshot, minimumSecuringLevelForMode(snapshot.mode));
      w.postMessage({ target: snapshot, kind, securing: securingProfileForUsage(snapshot.mode, usage), securingLabel: '결속 계산 조건: ' + usage.levelLabel });
    } catch {
      stop(); setRecords(prev => ({ ...prev, [kind]: { state: 'error', progress: 0, error: '점검 작업을 시작하지 못했습니다. 다시 시도하세요.' } }));
    }
  };
  const cancel = () => {
    const kind = active.current; stop();
    if (kind) setRecords(prev => ({ ...prev, [kind]: { state: 'cancelled', progress: 0 } }));
  };
  if (!open) return null;
  const ready = hasInspectionTarget(target);
  const busy = Object.values(records).some(r => r?.state === 'running');
  const visibleInspections = selectedKind ? INSPECTIONS.filter(item => item.id === selectedKind) : INSPECTIONS;
  const title = visibleInspections.length === 1 ? visibleInspections[0].title : '점검';
  return createPortal(<div className="safety-center-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section ref={dialog} tabIndex={-1} className={selectedKind ? 'safety-center-dialog safety-center-single' : 'safety-center-dialog'} role="dialog" aria-modal="true" aria-labelledby="manual-inspection-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><span>MANUAL INSPECTION</span><h2 id="manual-inspection-title">{title}</h2><p>현재 적재 결과를 직접 점검합니다. 계산 결과는 실제 운송 안전 인증이 아닙니다.</p></div><button type="button" onClick={close}>닫기</button></header>
      <div className="safety-center-summary"><div><span>점검 대상</span><b>{ready ? `${target.mode === 'pallets' ? '팔레트' : '박스'} 적재 · 상자 ${target.result.placements.length}개 · 팔레트 바닥판 ${target.supports?.length ?? 0}개` : '유효한 적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.'}</b></div>{busy && <button type="button" onClick={cancel}>실행 취소</button>}</div>
      <div className="safety-center-grid">{visibleInspections.map((item, index) => {
        const row = records[item.id];
        return <article key={item.id} aria-label={item.title} className={row?.result?.attention || row?.state === 'error' ? 'warn' : ''}>
          <div className="safety-center-card-head"><span>0{index + 1}</span><div><b>{item.title}</b><small>{item.description}</small></div></div>
          <strong role="status">{row?.state === 'running' ? `실행 중 ${row.progress}%` : row?.state === 'cancelled' ? '취소됨 · 결과 없음' : row?.state === 'error' ? '실행 실패' : row?.result?.summary ?? '미실행'}</strong>
          {row?.state === 'running' && <progress aria-label={item.title + ' 진행률'} value={row.progress} max={100} />}
          {row?.error && <p role="alert">{row.error}</p>}
          {row?.result && <><ul className="manual-inspection-details">{row.result.details.map((line, i) => <li key={i}>{line}</li>)}</ul><p className="manual-inspection-caution">{row.result.caution}</p></>}
          <button type="button" disabled={!ready || busy} onClick={() => run(item.id)}>{item.title} {row?.state === 'done' ? '다시 실행' : '실행'}</button>
        </article>;
      })}</div>
      <footer aria-live="polite">{message} 닫기·뒤로 가기 시 실행 중인 계산과 점검 결과를 폐기합니다.</footer>
    </section></div>, document.body);
}
