import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CONTAINER_PRESETS, SPECIAL_CONTAINER_REFERENCES, clonePresetSpec, matchContainerPreset, type ContainerPreset } from './containerPresets';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { STORAGE_UPDATED_EVENT, readStoredState, type StoredState } from './storage';

const TARGET_SELECTOR = '.dashboard-left .dashboard-card .static-setting';

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

export default function ContainerTypeSelector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
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

  const selectedId = useMemo(() => matchContainerPreset(container), [container]);
  const selected = CONTAINER_PRESETS.find(item => item.id === selectedId) ?? CONTAINER_PRESETS[CONTAINER_PRESETS.length - 1];

  const choose = (preset: ContainerPreset) => {
    if (preset.id === 'custom') {
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

  if (!target) return null;

  return <>
    {createPortal(<div className="container-preset-summary">
      <div><span>컨테이너 규격</span><b>{selected.shortLabel}</b><small>{selected.note}</small></div>
      <button type="button" onClick={() => setOpen(true)}>종류 선택</button>
    </div>, target)}

    {open && createPortal(<div className="container-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="container-picker-modal" role="dialog" aria-modal="true" aria-labelledby="container-picker-title">
        <header><div><span>CONTAINER TYPE</span><h2 id="container-picker-title">컨테이너 종류 선택</h2><p>실제 물리 형상이 구현된 규격만 선택할 수 있습니다. 특수 컨테이너는 형상 모델을 만든 뒤 활성화합니다.</p></div><button type="button" onClick={() => setOpen(false)}>닫기</button></header>
        <div className="container-picker-tabs"><b>▥ 컨테이너</b><span>🚚 트럭 · 추후 개발</span></div>
        <div className="container-card-grid">
          {CONTAINER_PRESETS.map(preset => <button type="button" key={preset.id} className={`container-type-card ${preset.id === selectedId ? 'selected' : ''}`} onClick={() => choose(preset)}>
            <strong>{preset.label}</strong>
            <ContainerLineIcon kind={preset.id === 'custom' ? 'custom' : 'dry'} />
            <span>{preset.id === 'custom' ? '직접 입력' : '선택 가능'}</span>
            <small>{preset.note}</small>
          </button>)}
          {SPECIAL_CONTAINER_REFERENCES.map(item => <button type="button" key={item.id} className="container-type-card disabled" disabled>
            <strong>{item.label}</strong>
            <ContainerLineIcon kind={item.icon} />
            <span>개발 예정</span>
            <small>{item.note}</small>
          </button>)}
        </div>
        <p className="container-picker-footnote">표준 규격 값은 참고 규격이며 선사·제조사·장비별 실제 내부 치수와 허용중량이 다를 수 있으므로 현장 장비 사양을 최종 확인하세요.</p>
      </section>
    </div>, document.body)}
  </>;
}
