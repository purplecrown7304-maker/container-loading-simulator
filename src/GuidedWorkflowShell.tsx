import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRANSPORT_EQUIPMENT_EVENT,
  useTransportEquipment,
  type TransportCategory,
} from './transportEquipment';
import { dispatchAppAction, openWorkspace } from './uiEvents';

type LiveDetail = { container: ContainerSpec; cargo: CargoItem[]; result?: LoadingResult };
type PalletSnapshotLite = {
  result?: {
    placements?: unknown[];
    remaining?: Array<{ cargoId: string; quantity: number; reason: string }>;
    totalPalletizedWeightKg?: number;
    palletCount?: number;
  };
};
type WorkflowWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
  __containerLoadingPalletSnapshot?: PalletSnapshotLite;
};

type HostSet = {
  left: HTMLElement | null;
  center: HTMLElement | null;
  right: HTMLElement | null;
};

type StepId = 1 | 2 | 3 | 4;

const steps: Array<{ id: StepId; label: string }> = [
  { id: 1, label: '장비 선택' },
  { id: 2, label: '화물 선택' },
  { id: 3, label: '자동 적재' },
  { id: 4, label: '결과 확인' },
];

function readLive(): LiveDetail {
  if (typeof window !== 'undefined') {
    const latest = (window as WorkflowWindow).__containerLoadingLatestResult;
    if (latest) return latest;
  }
  const stored = readStoredState();
  return {
    container: stored?.container ?? { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    cargo: stored?.cargo ?? [],
  };
}

function currentMode(): 'boxes' | 'pallets' {
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
}

function clickMode(mode: 'boxes' | 'pallets') {
  const label = mode === 'boxes' ? '박스' : '팔레트';
  const target = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(button => (button.textContent ?? '').trim() === label);
  target?.click();
}

function openEquipment(category?: TransportCategory) {
  window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: category ? { category } : undefined }));
}

function formatDimensions(item: CargoItem) {
  return `${Math.round(item.length * 1000)} × ${Math.round(item.width * 1000)} × ${Math.round(item.height * 1000)} mm`;
}

function StepRail({ step, furthest, live, finalReady, onStep }: {
  step: StepId;
  furthest: StepId;
  live: LiveDetail;
  finalReady: boolean;
  onStep: (step: StepId) => void;
}) {
  const total = live.cargo.reduce((sum, item) => sum + item.quantity, 0);
  const loaded = live.result?.placements.length ?? 0;
  return <section className="guided-step-rail" aria-label="작업 준비 단계">
    <h2>작업 준비</h2>
    <div className="guided-step-list">
      {steps.map(item => {
        const complete = item.id < step || (item.id === 4 && finalReady);
        const current = item.id === step;
        const enabled = item.id <= furthest;
        const meta = item.id === 1
          ? '장비 확인'
          : item.id === 2
            ? live.cargo.length ? `${live.cargo.length}종 / ${total} EA` : '미선택'
            : item.id === 3
              ? finalReady ? '검사 완료' : loaded ? '검사 중' : '대기'
              : finalReady ? '확인 가능' : '-';
        return <button key={item.id} type="button" className={`${current ? 'current' : ''} ${complete ? 'complete' : ''}`} disabled={!enabled} onClick={() => enabled && onStep(item.id)}>
          <span className="guided-step-dot">{complete ? '✓' : item.id}</span>
          <span className="guided-step-copy"><b>{item.label}</b><small>{meta}</small></span>
        </button>;
      })}
    </div>
  </section>;
}

function StagePanel({ step, live, mode, onMode }: {
  step: StepId;
  live: LiveDetail;
  mode: 'boxes' | 'pallets';
  onMode: (mode: 'boxes' | 'pallets') => void;
}) {
  const equipment = useTransportEquipment();
  const result = live.result;
  const total = live.cargo.reduce((sum, item) => sum + item.quantity, 0);
  const remaining = result?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const containerVolume = live.container.length * live.container.width * live.container.height;
  const fillRate = result && containerVolume > 0 ? result.usedVolumeM3 / containerVolume * 100 : 0;
  const weightRate = result && live.container.maxPayloadKg > 0 ? result.loadedWeightKg / live.container.maxPayloadKg * 100 : 0;

  if (step === 1) {
    return <section className="guided-stage-panel guided-equipment-stage">
      <div className="guided-panel-title"><h1>장비 선택</h1></div>
      <div className="guided-segmented">
        <button type="button" className={equipment.category === 'container' ? 'active' : ''} onClick={() => openEquipment('container')}>컨테이너</button>
        <button type="button" className={equipment.category === 'truck' ? 'active' : ''} onClick={() => openEquipment('truck')}>트럭</button>
      </div>
      <div className="guided-section-label">현재 선택 장비</div>
      <button type="button" className="guided-equipment-card selected" onClick={() => openEquipment(equipment.category)}>
        <span className="guided-equipment-icon">{equipment.category === 'truck' ? '▰' : '▥'}</span>
        <span><b>{equipment.shortName}</b><small>{equipment.length.toFixed(2)} × {equipment.width.toFixed(2)} × {equipment.height.toFixed(2)} m</small><small>최대 {equipment.maxPayloadKg.toLocaleString()} kg</small></span>
        <i>✓</i>
      </button>
      <div className="guided-equipment-specs">
        <div><span>내부 길이</span><b>{(live.container.length * 1000).toLocaleString()} mm</b></div>
        <div><span>내부 폭</span><b>{(live.container.width * 1000).toLocaleString()} mm</b></div>
        <div><span>내부 높이</span><b>{(live.container.height * 1000).toLocaleString()} mm</b></div>
        <div><span>최대 적재중량</span><b>{live.container.maxPayloadKg.toLocaleString()} kg</b></div>
      </div>
      <button type="button" className="guided-secondary-button" onClick={() => openEquipment(equipment.category)}>장비 변경</button>
    </section>;
  }

  if (step === 2) {
    return <section className="guided-stage-panel guided-cargo-stage">
      <div className="guided-panel-title"><h1>화물 선택</h1><button type="button" className="guided-secondary-button" onClick={() => openWorkspace('boxes')}>박스 선택</button></div>
      <div className="guided-segmented guided-mode-segment">
        <button type="button" className={mode === 'boxes' ? 'active' : ''} onClick={() => onMode('boxes')}>박스</button>
        <button type="button" className={mode === 'pallets' ? 'active' : ''} onClick={() => onMode('pallets')}>팔레트</button>
      </div>
      <div className="guided-cargo-layout">
        <div className="guided-cargo-master">
          <div className="guided-section-label">이번 적재 목록</div>
          {live.cargo.length === 0 ? <div className="guided-empty">박스 선택을 눌러 적재할 화물을 추가하세요.</div> : <div className="guided-cargo-list">
            {live.cargo.map(item => <article key={item.id}>
              <span className="guided-cargo-check">✓</span>
              <span className="guided-cargo-copy"><b>{item.id} <em>{item.name}</em></b><small>{formatDimensions(item)} · {item.weightKg.toLocaleString()} kg</small></span>
              <span className="guided-qty-control">
                <button type="button" onClick={() => {
                  const next = live.cargo.map(cargo => cargo.id === item.id ? { ...cargo, quantity: Math.max(0, cargo.quantity - 1) } : cargo);
                  writeStoredState({ container: live.container, cargo: next }, true);
                }}>−</button>
                <b>{item.quantity}</b>
                <button type="button" onClick={() => {
                  const next = live.cargo.map(cargo => cargo.id === item.id ? { ...cargo, quantity: cargo.quantity + 1 } : cargo);
                  writeStoredState({ container: live.container, cargo: next }, true);
                }}>＋</button>
              </span>
            </article>)}
          </div>}
        </div>
        <aside className="guided-cargo-total"><span>총 수량</span><b>{total.toLocaleString()} EA</b><small>{live.cargo.length}종 화물</small></aside>
      </div>
    </section>;
  }

  if (step === 4) {
    return <section className="guided-stage-panel guided-result-stage">
      <div className="guided-panel-title"><h1>결과 확인</h1><button type="button" className="guided-secondary-button" onClick={() => dispatchAppAction('show-results')}>상세 결과 보기</button></div>
      <div className="guided-result-tabs"><b>적재 결과</b><span>미적재</span><span>무게 분포</span><span>안전 검사</span></div>
      <div className="guided-result-grid">
        <div><span>요청</span><b>{total.toLocaleString()} EA</b></div>
        <div className="good"><span>적재</span><b>{(result?.placements.length ?? 0).toLocaleString()} EA</b></div>
        <div className={remaining ? 'warn' : 'good'}><span>미적재</span><b>{remaining.toLocaleString()} EA</b></div>
        <div><span>CBM 사용률</span><b>{fillRate.toFixed(1)}%</b></div>
        <div><span>중량 사용률</span><b>{weightRate.toFixed(1)}%</b></div>
        <div className="good"><span>작업 판정</span><b>결과 확인</b></div>
      </div>
      {result?.remaining.length ? <div className="guided-unloaded-list"><div className="guided-section-label">미적재 화물</div>{result.remaining.map(item => <article key={item.cargoId}><span><b>{item.cargoId}</b><small>{item.reason}</small></span><strong>{item.quantity} EA</strong></article>)}</div> : null}
    </section>;
  }

  return <section className="guided-stage-panel guided-loading-placeholder" aria-hidden="true" />;
}

function JobSummary({ live, mode, finalReady, running }: {
  live: LiveDetail;
  mode: 'boxes' | 'pallets';
  finalReady: boolean;
  running: boolean;
}) {
  const equipment = useTransportEquipment();
  const palletSnapshot = typeof window === 'undefined' ? undefined : (window as WorkflowWindow).__containerLoadingPalletSnapshot;
  const boxResult = live.result;
  const loaded = mode === 'pallets'
    ? palletSnapshot?.result?.placements?.length ?? 0
    : boxResult?.placements.length ?? 0;
  const remaining = mode === 'pallets'
    ? palletSnapshot?.result?.remaining?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    : boxResult?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const total = live.cargo.reduce((sum, item) => sum + item.quantity, 0);
  const weight = mode === 'pallets'
    ? palletSnapshot?.result?.totalPalletizedWeightKg ?? 0
    : boxResult?.loadedWeightKg ?? 0;
  const maxVolume = live.container.length * live.container.width * live.container.height;
  const usedVolume = boxResult?.usedVolumeM3 ?? 0;
  const fillRate = maxVolume > 0 && usedVolume > 0 ? usedVolume / maxVolume * 100 : 0;
  const status = finalReady ? '작업 가능' : running ? '검사 중' : loaded ? '검증 대기' : '대기';

  return <section className="guided-job-summary">
    <h2>현재 작업</h2>
    <dl>
      <div><dt>장비</dt><dd>{equipment.shortName}</dd></div>
      <div><dt>화물</dt><dd>{live.cargo.length ? `${live.cargo.length}종 / ${total} EA` : '-'}</dd></div>
      <div><dt>적재</dt><dd>{loaded ? `${loaded} EA` : '-'}</dd></div>
      <div><dt>미적재</dt><dd>{boxResult || palletSnapshot ? `${remaining} EA` : '-'}</dd></div>
      <div><dt>총 중량</dt><dd>{weight ? `${Math.round(weight).toLocaleString()} / ${live.container.maxPayloadKg.toLocaleString()} kg` : `- / ${live.container.maxPayloadKg.toLocaleString()} kg`}</dd></div>
      <div><dt>CBM</dt><dd>{mode === 'boxes' && usedVolume ? `${usedVolume.toFixed(1)} / ${maxVolume.toFixed(1)} m³` : `- / ${maxVolume.toFixed(1)} m³`}</dd></div>
      <div><dt>공간 사용률</dt><dd>{mode === 'boxes' && usedVolume ? `${fillRate.toFixed(1)}%` : '-'}</dd></div>
      <div className="guided-status-row"><dt>상태</dt><dd><i className={finalReady ? 'good' : running ? 'running' : ''} />{status}</dd></div>
    </dl>
  </section>;
}

function BottomBar({ step, live, running, finalReady, onAdvance }: {
  step: StepId;
  live: LiveDetail;
  running: boolean;
  finalReady: boolean;
  onAdvance: (step: StepId) => void;
}) {
  const hasCargo = live.cargo.some(item => item.quantity > 0);
  let label = '다음: 화물 선택';
  let disabled = false;
  let action = () => onAdvance(2);
  if (step === 2) {
    label = '적재 목록 적용';
    disabled = !hasCargo;
    action = () => onAdvance(3);
  } else if (step === 3) {
    if (finalReady) {
      label = '결과 확인';
      action = () => onAdvance(4);
    } else {
      label = running ? '최종 적재 검사 중…' : '최종 적재 진행';
      disabled = running || !hasCargo;
      action = () => dispatchAppAction('run-loading');
    }
  } else if (step === 4) {
    label = '작업지시서 보기';
    disabled = !finalReady;
    action = () => dispatchAppAction('print-report');
  }
  return <div className="guided-bottom-bar">
    <button type="button" className="guided-reset-link" onClick={() => dispatchAppAction('reset-all')}>↻ 전체 초기화</button>
    <button type="button" className="guided-primary-cta" disabled={disabled} onClick={action}>{label}{!running && step !== 4 ? '  ›' : ''}</button>
    <span className="guided-bottom-spacer" />
  </div>;
}

export default function GuidedWorkflowShell() {
  const [hosts, setHosts] = useState<HostSet>({ left: null, center: null, right: null });
  const [live, setLive] = useState<LiveDetail>(() => readLive());
  const [mode, setMode] = useState<'boxes' | 'pallets'>(() => typeof document === 'undefined' ? 'boxes' : currentMode());
  const [step, setStep] = useState<StepId>(() => readLive().cargo.length ? 2 : 1);
  const [furthest, setFurthest] = useState<StepId>(() => readLive().cargo.length ? 2 : 1);
  const [running, setRunning] = useState(false);
  const [finalReady, setFinalReady] = useState(false);

  const advance = (next: StepId) => {
    setStep(next);
    setFurthest(previous => Math.max(previous, next) as StepId);
  };

  useEffect(() => {
    document.documentElement.dataset.guidedWorkflow = 'true';
    document.documentElement.dataset.guidedStep = String(step);
    return () => {
      delete document.documentElement.dataset.guidedWorkflow;
      delete document.documentElement.dataset.guidedStep;
    };
  }, [step]);

  useEffect(() => {
    let frame = 0;
    const syncHosts = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setHosts({
        left: document.querySelector<HTMLElement>('.dashboard-left'),
        center: document.querySelector<HTMLElement>('.dashboard-center'),
        right: document.querySelector<HTMLElement>('.dashboard-right'),
      }));
    };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setLive(readLive());
      setMode(currentMode());
    };
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener('container-loading:pallet-snapshot-updated', refresh);
    const observer = new MutationObserver(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.inspection-status-table tbody tr')];
      const workOrderRow = rows.find(row => (row.textContent ?? '').includes('작업지시서'));
      const ready = Boolean(workOrderRow && /발급 가능|보기 가능|완료/.test(workOrderRow.textContent ?? ''));
      const activeRun = Boolean(document.querySelector('.calculation-overlay')) || rows.some(row => /진행/.test(row.textContent ?? ''));
      setFinalReady(ready);
      setRunning(activeRun && !ready);
      if (ready) setFurthest(previous => Math.max(previous, 4) as StepId);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    refresh();
    return () => {
      observer.disconnect();
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener('container-loading:pallet-snapshot-updated', refresh);
    };
  }, []);

  const rail = useMemo(() => hosts.left ? createPortal(<StepRail step={step} furthest={furthest} live={live} finalReady={finalReady} onStep={setStep} />, hosts.left) : null, [hosts.left, step, furthest, live, finalReady]);
  const center = useMemo(() => hosts.center ? createPortal(<StagePanel step={step} live={live} mode={mode} onMode={next => { clickMode(next); setMode(next); }} />, hosts.center) : null, [hosts.center, step, live, mode]);
  const summary = useMemo(() => hosts.right ? createPortal(<JobSummary live={live} mode={mode} finalReady={finalReady} running={running} />, hosts.right) : null, [hosts.right, live, mode, finalReady, running]);

  return <>{rail}{center}{summary}{typeof document !== 'undefined' ? createPortal(<BottomBar step={step} live={live} running={running} finalReady={finalReady} onAdvance={advance} />, document.body) : null}</>;
}
