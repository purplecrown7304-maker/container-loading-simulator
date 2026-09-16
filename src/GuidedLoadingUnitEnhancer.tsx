import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';

export type GuidedLoadingUnit = 'boxes' | 'pallets';

export const GUIDED_LOADING_UNIT_KEY = 'container-loading:guided-loading-unit';
export const GUIDED_LOADING_UNIT_EVENT = 'container-loading:guided-loading-unit-updated';

type Anchor = { left: number; top: number; width: number };

type GuidedStep = '1' | '2' | '3' | '4' | '5' | '6' | '';

function modeLabel(unit: GuidedLoadingUnit) {
  return unit === 'boxes' ? '박스 직접 적재' : '파렛트 적재';
}

function strategyLabel() {
  const strategy = readLoadingStrategyPreference();
  if (strategy === 'stability') return '무게중심·안정성 우선형';
  if (strategy === 'capacity') return '공간효율·적재량 우선형';
  if (strategy === 'unloading') return '하역 순서 우선형';
  return '전략 미선택';
}

function currentUnderlyingMode(): GuidedLoadingUnit {
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
}

function clickUnderlyingMode(unit: GuidedLoadingUnit) {
  const label = unit === 'boxes' ? '박스' : '팔레트';
  const target = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(button => (button.textContent ?? '').trim() === label);
  target?.click();
  return Boolean(target);
}

function readPersistedUnit(): GuidedLoadingUnit | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(GUIDED_LOADING_UNIT_KEY);
  return value === 'boxes' || value === 'pallets' ? value : null;
}

function persistUnit(unit: GuidedLoadingUnit | null) {
  if (unit) window.localStorage.setItem(GUIDED_LOADING_UNIT_KEY, unit);
  else window.localStorage.removeItem(GUIDED_LOADING_UNIT_KEY);
  window.dispatchEvent(new CustomEvent(GUIDED_LOADING_UNIT_EVENT, { detail: unit }));
}

function sameAnchor(a: Anchor | null, b: Anchor | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.width - b.width) < 0.5;
}

export default function GuidedLoadingUnitEnhancer() {
  const [step, setStep] = useState<GuidedStep>(() => typeof document === 'undefined' ? '' : (document.documentElement.dataset.guidedStep as GuidedStep) ?? '');
  const [unit, setUnit] = useState<GuidedLoadingUnit | null>(() => typeof window === 'undefined' ? null : readPersistedUnit());
  const [selectorAnchor, setSelectorAnchor] = useState<Anchor | null>(null);
  const [viewerAnchor, setViewerAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const syncStep = () => setStep((document.documentElement.dataset.guidedStep as GuidedStep) ?? '');
    syncStep();
    const observer = new MutationObserver(syncStep);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (step === '1' || step === '2' || step === '3') {
      if (unit !== null) {
        setUnit(null);
        persistUnit(null);
      }
      return;
    }

    if (step === '4' && unit === null) {
      const initial = readPersistedUnit() ?? currentUnderlyingMode();
      setUnit(initial);
      persistUnit(initial);
      clickUnderlyingMode(initial);
      return;
    }

    if ((step === '5' || step === '6') && unit) {
      // 단계 전환 직후에도 사용자가 선택한 적재 유형을 다시 적용한다.
      // 숨겨진 모드 탭을 직접 조작하지 않고 React의 기존 클릭 핸들러를 사용한다.
      clickUnderlyingMode(unit);
    }
  }, [step, unit]);

  useEffect(() => {
    if (unit) document.documentElement.dataset.guidedLoadingUnit = unit;
    else delete document.documentElement.dataset.guidedLoadingUnit;
    return () => { delete document.documentElement.dataset.guidedLoadingUnit; };
  }, [unit]);

  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (step === '4') {
          const stage = document.querySelector<HTMLElement>('.guided-strategy-stage');
          const title = stage?.querySelector<HTMLElement>('.guided-panel-title');
          if (stage && title) {
            const stageRect = stage.getBoundingClientRect();
            const titleRect = title.getBoundingClientRect();
            const next = {
              left: stageRect.left + 16,
              top: titleRect.bottom + 12,
              width: Math.max(280, stageRect.width - 32),
            };
            setSelectorAnchor(current => sameAnchor(current, next) ? current : next);
            setViewerAnchor(null);
            resizeObserver?.disconnect();
            resizeObserver = new ResizeObserver(measure);
            resizeObserver.observe(stage);
            return;
          }
        }

        if (step === '5') {
          const viewer = document.querySelector<HTMLElement>('.viewer-card');
          if (viewer) {
            const rect = viewer.getBoundingClientRect();
            const next = {
              left: rect.left + 18,
              top: rect.top + 18,
              width: Math.max(240, Math.min(560, rect.width - 36)),
            };
            setViewerAnchor(current => sameAnchor(current, next) ? current : next);
            setSelectorAnchor(null);
            resizeObserver?.disconnect();
            resizeObserver = new ResizeObserver(measure);
            resizeObserver.observe(viewer);
            return;
          }
        }

        setSelectorAnchor(null);
        setViewerAnchor(null);
        resizeObserver?.disconnect();
        resizeObserver = null;
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  const choose = (next: GuidedLoadingUnit) => {
    if (!clickUnderlyingMode(next)) return;
    setUnit(next);
    persistUnit(next);
  };

  const selectedStrategyLabel = useMemo(() => strategyLabel(), [step, unit]);

  const selector = step === '4' && selectorAnchor && typeof document !== 'undefined' ? createPortal(
    <section
      className="guided-loading-unit-floating"
      style={{ left: selectorAnchor.left, top: selectorAnchor.top, width: selectorAnchor.width }}
      aria-label="적재 유형 선택"
    >
      <div className="guided-loading-unit-block">
        <div className="guided-loading-unit-heading">
          <div><b>1. 적재 유형</b><span>제품 포장 결과를 박스로 직접 적재할지, 파렛트 단위로 적재할지 선택합니다.</span></div>
          <strong className={unit ? 'ready' : ''}>{unit ? modeLabel(unit) : '선택 필요'}</strong>
        </div>
        <div className="guided-loading-unit-grid" role="radiogroup" aria-label="박스 또는 파렛트 선택">
          <button type="button" role="radio" aria-checked={unit === 'boxes'} className={unit === 'boxes' ? 'selected' : ''} onClick={() => choose('boxes')}>
            <i>{unit === 'boxes' ? '✓' : '□'}</i><span><b>박스 직접 적재</b><small>포장된 박스를 컨테이너·트럭 바닥에 직접 최적 배치합니다.</small></span>
          </button>
          <button type="button" role="radio" aria-checked={unit === 'pallets'} className={unit === 'pallets' ? 'selected' : ''} onClick={() => choose('pallets')}>
            <i>{unit === 'pallets' ? '✓' : '▤'}</i><span><b>파렛트 적재</b><small>포장된 박스를 파렛트에 구성한 뒤 파렛트 단위로 최적 배치합니다.</small></span>
          </button>
        </div>
        <div className="guided-loading-unit-divider"><span>2. 적재 전략</span></div>
      </div>
    </section>,
    document.body,
  ) : null;

  const runningBadge = step === '5' && unit && viewerAnchor && typeof document !== 'undefined' ? createPortal(
    <div
      className="guided-loading-unit-running-badge"
      style={{ left: viewerAnchor.left, top: viewerAnchor.top, maxWidth: viewerAnchor.width }}
      aria-live="polite"
    >
      <b>자동 적재 유형 · {modeLabel(unit)}</b>
      <span>{selectedStrategyLabel}</span>
    </div>,
    document.body,
  ) : null;

  return <>{selector}{runningBadge}</>;
}
