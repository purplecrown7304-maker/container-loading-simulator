import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type GuidedLoadingUnit = 'boxes' | 'pallets';

export const GUIDED_LOADING_UNIT_KEY = 'container-loading:guided-loading-unit';
export const GUIDED_LOADING_UNIT_EVENT = 'container-loading:guided-loading-unit-updated';

function modeLabel(unit: GuidedLoadingUnit) {
  return unit === 'boxes' ? '박스' : '팔레트';
}

function clickUnderlyingMode(unit: GuidedLoadingUnit) {
  const label = modeLabel(unit);
  const target = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(button => (button.textContent ?? '').trim() === label);
  target?.click();
  return Boolean(target);
}

function persistUnit(unit: GuidedLoadingUnit | null) {
  if (unit) window.localStorage.setItem(GUIDED_LOADING_UNIT_KEY, unit);
  else window.localStorage.removeItem(GUIDED_LOADING_UNIT_KEY);
  window.dispatchEvent(new CustomEvent(GUIDED_LOADING_UNIT_EVENT, { detail: unit }));
}

export default function GuidedLoadingUnitEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [summaryHost, setSummaryHost] = useState<HTMLElement | null>(null);
  const [unit, setUnit] = useState<GuidedLoadingUnit | null>(null);

  useEffect(() => {
    let frame = 0;
    const syncHosts = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const stage = document.querySelector<HTMLElement>('.guided-strategy-stage');
        if (stage) {
          let nextHost = stage.querySelector<HTMLElement>('.guided-loading-unit-host');
          if (!nextHost) {
            nextHost = document.createElement('div');
            nextHost.className = 'guided-loading-unit-host';
            const strategyGrid = stage.querySelector<HTMLElement>('.guided-strategy-grid');
            if (strategyGrid) stage.insertBefore(nextHost, strategyGrid);
            else stage.appendChild(nextHost);
          }
          setHost(current => current === nextHost ? current : nextHost);
        } else {
          setHost(null);
        }

        const summary = document.querySelector<HTMLElement>('.guided-job-summary dl');
        if (summary) {
          let nextSummaryHost = summary.querySelector<HTMLElement>('.guided-loading-unit-summary-host');
          if (!nextSummaryHost) {
            nextSummaryHost = document.createElement('div');
            nextSummaryHost.className = 'guided-loading-unit-summary-host';
            const rows = [...summary.children];
            const packagingRow = rows.find(row => (row.textContent ?? '').includes('포장 적재단위'));
            if (packagingRow?.nextSibling) summary.insertBefore(nextSummaryHost, packagingRow.nextSibling);
            else summary.appendChild(nextSummaryHost);
          }
          setSummaryHost(current => current === nextSummaryHost ? current : nextSummaryHost);
        } else {
          setSummaryHost(null);
        }
      });
    };

    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const syncStep = () => {
      const step = document.documentElement.dataset.guidedStep;
      if (step === '1' || step === '2' || step === '3') {
        setUnit(current => {
          if (current === null) return current;
          persistUnit(null);
          return null;
        });
      }
    };
    syncStep();
    const observer = new MutationObserver(syncStep);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (unit) document.documentElement.dataset.guidedLoadingUnit = unit;
    else delete document.documentElement.dataset.guidedLoadingUnit;
    return () => { delete document.documentElement.dataset.guidedLoadingUnit; };
  }, [unit]);

  useEffect(() => {
    const syncGate = () => {
      if (document.documentElement.dataset.guidedStep !== '4') return;
      const cta = document.querySelector<HTMLButtonElement>('.guided-primary-cta');
      if (!cta) return;
      const strategyReady = Boolean(document.querySelector('.guided-strategy-card.selected'));
      const ready = Boolean(unit) && strategyReady;
      const nextDisabled = !ready;
      if (cta.disabled !== nextDisabled) cta.disabled = nextDisabled;
      const nextLabel = !unit && !strategyReady
        ? '적재 단위와 전략을 선택하세요'
        : !unit
          ? '박스 또는 파렛트를 선택하세요'
          : !strategyReady
            ? '적재 전략을 선택하세요'
            : '선택 완료 · 다음: 자동 적재  ›';
      if ((cta.textContent ?? '') !== nextLabel) cta.textContent = nextLabel;
    };

    syncGate();
    const observer = new MutationObserver(syncGate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    const htmlObserver = new MutationObserver(syncGate);
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });
    return () => {
      observer.disconnect();
      htmlObserver.disconnect();
    };
  }, [unit]);

  const choose = (next: GuidedLoadingUnit) => {
    if (!clickUnderlyingMode(next)) return;
    setUnit(next);
    persistUnit(next);
  };

  const selector = host ? createPortal(
    <section className="guided-loading-unit-block" aria-label="적재 단위 선택">
      <div className="guided-loading-unit-heading">
        <div><b>1. 적재 단위</b><span>포장된 제품을 박스로 직접 적재할지, 파렛트에 올려 적재할지 선택합니다.</span></div>
        <strong className={unit ? 'ready' : ''}>{unit ? `${modeLabel(unit)} 선택` : '선택 필요'}</strong>
      </div>
      <div className="guided-loading-unit-grid" role="radiogroup" aria-label="박스 또는 파렛트 선택">
        <button type="button" role="radio" aria-checked={unit === 'boxes'} className={unit === 'boxes' ? 'selected' : ''} onClick={() => choose('boxes')}>
          <i>{unit === 'boxes' ? '✓' : '□'}</i><span><b>박스 직접 적재</b><small>제품 포장 결과의 박스를 컨테이너·트럭에 직접 최적 배치합니다.</small></span>
        </button>
        <button type="button" role="radio" aria-checked={unit === 'pallets'} className={unit === 'pallets' ? 'selected' : ''} onClick={() => choose('pallets')}>
          <i>{unit === 'pallets' ? '✓' : '▤'}</i><span><b>파렛트 적재</b><small>포장된 박스를 파렛트에 구성한 뒤 파렛트 단위로 차량 내부에 배치합니다.</small></span>
        </button>
      </div>
      <div className="guided-loading-unit-divider"><span>2. 적재 전략</span></div>
    </section>,
    host,
  ) : null;

  const summary = summaryHost ? createPortal(
    <><dt>적재 단위</dt><dd>{unit ? (unit === 'boxes' ? '박스 직접 적재' : '파렛트 적재') : '-'}</dd></>,
    summaryHost,
  ) : null;

  return <>{selector}{summary}</>;
}
