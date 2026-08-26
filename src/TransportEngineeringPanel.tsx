import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { assessTruckAxleLoad } from './engine/truckAxleLoad';
import type { CargoItem, ContainerSpec, LoadingResult, TransportRoofModel, TransportWallModel } from './engine/types';
import { STORAGE_UPDATED_EVENT, readStoredState, type StoredState } from './storage';

const TARGET_SELECTOR = '.dashboard-right';

type LoadingResultWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

type AxleDraft = {
  frontSupportX: string;
  rearSupportX: string;
  frontMaxKg: string;
  rearMaxKg: string;
  tareFrontKg: string;
  tareRearKg: string;
};

const emptyDraft: AxleDraft = {
  frontSupportX: '', rearSupportX: '', frontMaxKg: '', rearMaxKg: '', tareFrontKg: '', tareRearKg: '',
};

function draftFrom(container: ContainerSpec): AxleDraft {
  const model = container.truckAxles;
  if (!model) return emptyDraft;
  return {
    frontSupportX: String(model.frontSupportX),
    rearSupportX: String(model.rearSupportX),
    frontMaxKg: model.frontMaxKg ? String(model.frontMaxKg) : '',
    rearMaxKg: model.rearMaxKg ? String(model.rearMaxKg) : '',
    tareFrontKg: model.tareFrontKg ? String(model.tareFrontKg) : '',
    tareRearKg: model.tareRearKg ? String(model.tareRearKg) : '',
  };
}

function currentState(): StoredState | null {
  const live = (window as LoadingResultWindow).__containerLoadingLatestResult;
  if (live) return { container: live.container, cargo: live.cargo };
  return readStoredState();
}

function parseOptional(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function TransportEngineeringPanel() {
  const initial = typeof window === 'undefined' ? null : currentState();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<ContainerSpec | null>(initial?.container ?? null);
  const [cargo, setCargo] = useState<CargoItem[]>(initial?.cargo ?? []);
  const [result, setResult] = useState<LoadingResult | null>(() => {
    if (typeof window === 'undefined') return null;
    return (window as LoadingResultWindow).__containerLoadingLatestResult?.result ?? null;
  });
  const [draft, setDraft] = useState<AxleDraft>(() => initial?.container ? draftFrom(initial.container) : emptyDraft);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const find = () => {
      if (cancelled) return;
      const node = document.querySelector(TARGET_SELECTOR);
      if (node instanceof HTMLElement) setTarget(node);
      else window.setTimeout(find, 120);
    };
    find();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onStored = (event: Event) => {
      const detail = (event as CustomEvent<StoredState>).detail;
      if (!detail) return;
      setContainer(detail.container);
      setCargo(detail.cargo);
      setDraft(draftFrom(detail.container));
      setMessage('');
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult }>).detail;
      if (!detail) return;
      setContainer(detail.container);
      setCargo(detail.cargo);
      setResult(detail.result);
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onStored);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStored);
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
    };
  }, []);

  const assessment = useMemo(() => container && result ? assessTruckAxleLoad(container, result) : undefined, [container, result]);
  if (!target || !container || container.transportKind !== 'truck') return null;

  const dispatch = (next: ContainerSpec) => {
    setContainer(next);
    const detail: StoredState = { container: next, cargo };
    window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail }));
  };

  const updateStructure = (field: 'sideWallModel' | 'roofModel', value: string) => {
    const next = field === 'sideWallModel'
      ? { ...container, sideWallModel: value as TransportWallModel }
      : { ...container, roofModel: value as TransportRoofModel };
    dispatch(next);
  };

  const saveAxles = () => {
    const frontSupportX = Number(draft.frontSupportX);
    const rearSupportX = Number(draft.rearSupportX);
    if (!Number.isFinite(frontSupportX) || !Number.isFinite(rearSupportX)
      || frontSupportX < 0 || rearSupportX > container.length || rearSupportX - frontSupportX <= 0.2) {
      setMessage(`축 위치를 확인하세요. 0~${container.length.toFixed(2)}m 안에서 앞축 < 뒤축이어야 합니다.`);
      return;
    }
    dispatch({
      ...container,
      truckAxles: {
        frontSupportX,
        rearSupportX,
        frontMaxKg: parseOptional(draft.frontMaxKg),
        rearMaxKg: parseOptional(draft.rearMaxKg),
        tareFrontKg: parseOptional(draft.tareFrontKg),
        tareRearKg: parseOptional(draft.tareRearKg),
      },
    });
    setMessage('실제 차량 축 정보를 적용했습니다. 다음 최적 적재부터 축하중도 후보 평가에 반영됩니다.');
  };

  const clearAxles = () => {
    const { truckAxles: _removed, ...rest } = container;
    dispatch(rest);
    setDraft(emptyDraft);
    setMessage('축하중 모델을 해제했습니다. 앞뒤 무게중심 균형만 평가합니다.');
  };

  const severityLabel = assessment?.severity === 'over' ? '초과/위험'
    : assessment?.severity === 'warning' ? '주의'
      : assessment?.severity === 'invalid' ? '설정 오류'
        : assessment ? '범위 내' : '미설정';

  return createPortal(<section className="dashboard-card transport-engineering-card">
    <div className="card-title"><span>8</span><div><b>트럭 구조 · 축하중</b><small>실제 차량 제원을 알 때만 입력</small></div></div>
    <div className="transport-structure-grid">
      <label><span>측면 구조</span><select value={container.sideWallModel ?? 'rigid'} onChange={event => updateStructure('sideWallModel', event.target.value)}>
        <option value="rigid">강체 벽</option><option value="curtain">커튼 · 비지지</option>
      </select></label>
      <label><span>지붕 구조</span><select value={container.roofModel ?? 'rigid'} onChange={event => updateStructure('roofModel', event.target.value)}>
        <option value="rigid">강체 지붕</option><option value="soft">연성 지붕 · 비지지</option><option value="open">개방</option>
      </select></label>
    </div>

    <div className="transport-model-note">
      <b>{container.sideWallModel === 'curtain' ? '커튼 측벽은 화물 지지벽으로 계산하지 않음' : '측벽 강체 접촉 사용'}</b>
      <span>{container.roofModel === 'rigid' ? '지붕 강체 접촉 사용' : '지붕을 구조 지지면으로 사용하지 않음'}</span>
    </div>

    <div className="axle-config-head"><div><b>축/축군 반력 모델</b><span>적재함 안쪽 0m 기준 실제 지지축 중심 위치</span></div><strong className={`axle-severity ${assessment?.severity ?? 'unset'}`}>{severityLabel}</strong></div>
    <div className="axle-input-grid">
      <label><span>앞 지지축 X(m)</span><input value={draft.frontSupportX} inputMode="decimal" onChange={e => setDraft(v => ({ ...v, frontSupportX: e.target.value }))} /></label>
      <label><span>뒤 지지축 X(m)</span><input value={draft.rearSupportX} inputMode="decimal" onChange={e => setDraft(v => ({ ...v, rearSupportX: e.target.value }))} /></label>
      <label><span>앞 허용하중(kg)</span><input value={draft.frontMaxKg} inputMode="decimal" placeholder="선택" onChange={e => setDraft(v => ({ ...v, frontMaxKg: e.target.value }))} /></label>
      <label><span>뒤 허용하중(kg)</span><input value={draft.rearMaxKg} inputMode="decimal" placeholder="선택" onChange={e => setDraft(v => ({ ...v, rearMaxKg: e.target.value }))} /></label>
      <label><span>공차 앞축(kg)</span><input value={draft.tareFrontKg} inputMode="decimal" placeholder="선택" onChange={e => setDraft(v => ({ ...v, tareFrontKg: e.target.value }))} /></label>
      <label><span>공차 뒤축(kg)</span><input value={draft.tareRearKg} inputMode="decimal" placeholder="선택" onChange={e => setDraft(v => ({ ...v, tareRearKg: e.target.value }))} /></label>
    </div>
    <div className="axle-actions"><button type="button" onClick={saveAxles}>실제 축 정보 적용</button>{container.truckAxles && <button type="button" className="secondary" onClick={clearAxles}>해제</button>}</div>

    {assessment?.validGeometry && <div className="axle-result-grid">
      <div><span>화물 COG</span><b>{assessment.cargoCogX.toFixed(2)} m</b></div>
      <div><span>앞 추정하중</span><b>{assessment.frontTotalKg.toFixed(0)} kg</b><small>{assessment.frontUtilization === undefined ? '허용치 미입력' : `${(assessment.frontUtilization * 100).toFixed(1)}%`}</small></div>
      <div><span>뒤 추정하중</span><b>{assessment.rearTotalKg.toFixed(0)} kg</b><small>{assessment.rearUtilization === undefined ? '허용치 미입력' : `${(assessment.rearUtilization * 100).toFixed(1)}%`}</small></div>
    </div>}
    {assessment?.messages.map((text, index) => <p className="axle-message" key={index}>{text}</p>)}
    {message && <p className="axle-save-message">{message}</p>}
    <p className="transport-disclaimer">단순보 반력은 최적화 비교용입니다. 실제 축중은 킹핀·축군·서스펜션·차체 공차축중 및 현장 계근값으로 최종 확인해야 합니다.</p>
  </section>, target);
}
