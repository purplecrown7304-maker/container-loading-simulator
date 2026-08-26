import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CONTAINER_PRESETS, SPECIAL_CONTAINER_REFERENCES, clonePresetSpec, matchContainerPreset, type ContainerPreset } from './containerPresets';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { STORAGE_UPDATED_EVENT, readStoredState, type StoredState } from './storage';
import { TRUCK_PRESETS, TRUCK_REFERENCE_ONLY, cloneTruckSpec, matchTruckPreset, type TruckPreset } from './truckPresets';

const TARGET_SELECTOR = '.dashboard-left .dashboard-card .static-setting';
type PickerTab = 'container' | 'truck';

type LoadingResultWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function currentState(): StoredState {
  const live = (window as LoadingResultWindow).__containerLoadingLatestResult;
  if (live) return { container: live.container, cargo: live.cargo };
  return readStoredState() ?? {
    container: CONTAINER_PRESETS.find(item => item.id === '40-high-cube')!.spec!,
    cargo: [],
  };
}

function dispatchContainer(container: ContainerSpec) {
  const state = currentState();
  const detail: StoredState = { container, cargo: state.cargo };
  window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail }));
}

function openCustomInputs(target: HTMLElement) {
  const details = target.closest('.dashboard-card')?.querySelector('details');
  if (details instanceof HTMLDetailsElement) details.open = true;
}

function ContainerLineIcon({ kind = 'dry' }: { kind?: string }) {
  return <span className={`container-line-icon ${kind}`} aria-hidden="true"><i /><b /></span>;
}

function TruckLineIcon({ kind }: { kind: string }) {
  return <span className={`truck-line-icon ${kind}`} aria-hidden="true">
    <i className="truck-cab" /><i className="truck-body" /><i className="truck-wheel one" /><i className="truck-wheel two" /><i className="truck-wheel three" />
    {kind === 'reefer-truck' || kind === 'isotherm-truck' ? <b>❄</b> : null}
  </span>;
}

export default function ContainerTypeSelector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>('container');
  const [container, setContainer] = useState<ContainerSpec>(() => typeof window === 'undefined' ? CONTAINER_PRESETS[3].spec! : currentState().container);

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
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<StoredState>).detail;
      if (detail?.container) setContainer(detail.container);
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    if (open) setTab(container.transportKind === 'truck' ? 'truck' : 'container');
  }, [open, container.transportKind]);

  const containerPresetId = useMemo(() => matchContainerPreset(container), [container]);
  const truckPresetId = useMemo(() => matchTruckPreset(container), [container]);
  const selectedContainer = CONTAINER_PRESETS.find(item => item.id === containerPresetId) ?? CONTAINER_PRESETS[CONTAINER_PRESETS.length - 1];
  const selectedTruck = TRUCK_PRESETS.find(item => item.id === truckPresetId) ?? TRUCK_PRESETS[TRUCK_PRESETS.length - 1];
  const truckMode = container.transportKind === 'truck';
  const selectedLabel = truckMode ? selectedTruck.shortLabel : selectedContainer.shortLabel;
  const selectedNote = truckMode ? selectedTruck.note : selectedContainer.note;

  const chooseContainer = (preset: ContainerPreset) => {
    if (preset.id === 'custom') {
      const custom: ContainerSpec = {
        ...container,
        transportKind: 'container',
        transportType: 'custom-container',
        sideWallModel: 'rigid',
        roofModel: 'rigid',
        temperatureControlled: false,
      };
      setContainer(custom);
      dispatchContainer(custom);
      if (target) openCustomInputs(target);
      setOpen(false);
      return;
    }
    const spec = clonePresetSpec(preset);
    if (!spec) return;
    setContainer(spec);
    dispatchContainer(spec);
    setOpen(false);
  };

  const chooseTruck = (preset: TruckPreset) => {
    if (preset.id === 'custom-truck') {
      const custom: ContainerSpec = {
        ...container,
        transportKind: 'truck',
        transportType: 'custom-truck',
        sideWallModel: container.sideWallModel ?? 'rigid',
        roofModel: container.roofModel ?? 'rigid',
      };
      setContainer(custom);
      dispatchContainer(custom);
      if (target) openCustomInputs(target);
      setOpen(false);
      return;
    }
    const spec = cloneTruckSpec(preset);
    if (!spec) return;
    setContainer(spec);
    dispatchContainer(spec);
    setOpen(false);
  };

  if (!target) return null;

  return <>
    {createPortal(<div className="container-preset-summary">
      <div><span>{truckMode ? '트럭 적재공간' : '컨테이너 규격'}</span><b>{selectedLabel}</b><small>{selectedNote}</small></div>
      <button type="button" onClick={() => setOpen(true)}>종류 선택</button>
    </div>, target)}

    {open && createPortal(<div className="container-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="container-picker-modal" role="dialog" aria-modal="true" aria-labelledby="container-picker-title">
        <header><div><span>TRANSPORT BODY TYPE</span><h2 id="container-picker-title">컨테이너 및 트럭 유형</h2><p>운송장비를 바꾸면 내부 치수·허용중량과 물리 벽체 조건도 함께 바뀝니다.</p></div><button type="button" onClick={() => setOpen(false)}>닫기</button></header>
        <div className="container-picker-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'container'} className={tab === 'container' ? 'active' : ''} onClick={() => setTab('container')}>▥ 컨테이너</button>
          <button type="button" role="tab" aria-selected={tab === 'truck'} className={tab === 'truck' ? 'active' : ''} onClick={() => setTab('truck')}>🚚 트럭</button>
        </div>

        {tab === 'container' ? <div className="container-card-grid">
          {CONTAINER_PRESETS.map(preset => <button type="button" key={preset.id} className={`container-type-card ${!truckMode && preset.id === containerPresetId ? 'selected' : ''}`} onClick={() => chooseContainer(preset)}>
            <strong>{preset.label}</strong>
            <ContainerLineIcon kind={preset.id === 'custom' ? 'custom' : 'dry'} />
            <span>{preset.id === 'custom' ? '직접 입력' : '선택 가능'}</span>
            <small>{preset.note}</small>
          </button>)}
          {SPECIAL_CONTAINER_REFERENCES.map(item => <button type="button" key={item.id} className="container-type-card disabled" disabled>
            <strong>{item.label}</strong>
            <ContainerLineIcon kind={item.icon} />
            <span>형상 엔진 개발 예정</span>
            <small>{item.note}</small>
          </button>)}
        </div> : <div className="container-card-grid truck-card-grid">
          {TRUCK_PRESETS.map(preset => <button type="button" key={preset.id} className={`container-type-card truck-type-card ${truckMode && preset.id === truckPresetId ? 'selected' : ''}`} onClick={() => chooseTruck(preset)}>
            <strong>{preset.label}</strong>
            <TruckLineIcon kind={preset.icon} />
            <span>{preset.id === 'custom-truck' ? '직접 입력' : '선택 가능'}</span>
            <small>{preset.pallets ? `${preset.pallets} · ` : ''}{preset.note}</small>
          </button>)}
          {TRUCK_REFERENCE_ONLY.map(item => <button type="button" key={item.id} className="container-type-card truck-type-card disabled" disabled>
            <strong>{item.label}</strong>
            <TruckLineIcon kind={item.icon} />
            <span>분할 차체 엔진 개발 예정</span>
            <small>{item.note}</small>
          </button>)}
        </div>}

        <p className="container-picker-footnote">표시 규격은 적재 시뮬레이션 시작을 위한 참고값입니다. 실제 내부 치수·축중·적재 허용중량·냉동기/휠하우스 돌출·고박점 위치는 차량별로 달라 현장 장비 사양을 최종 확인해야 합니다. 커튼사이더의 측면 커튼은 화물 지지용 강체 벽으로 간주하지 않습니다.</p>
      </section>
    </div>, document.body)}
  </>;
}
