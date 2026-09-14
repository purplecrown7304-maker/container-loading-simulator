import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GUIDED_LOADING_UNIT_EVENT,
  readGuidedLoadingUnit,
  writeGuidedLoadingUnit,
  type GuidedLoadingUnit,
} from './guidedLoadingUnit';

function clickAppMode(unit: GuidedLoadingUnit) {
  const label = unit === 'boxes' ? '박스' : '팔레트';
  const button = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(item => (item.textContent ?? '').trim() === label);
  if (button && !button.classList.contains('active')) button.click();
}

export default function GuidedLoadingUnitSelector() {
  const [unit, setUnit] = useState<GuidedLoadingUnit>(() => readGuidedLoadingUnit());
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const mount = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selector = document.querySelector<HTMLElement>('.loading-strategy-selector');
        if (!selector) { setHost(null); return; }
        let target = selector.querySelector<HTMLElement>(':scope > .guided-loading-unit-host');
        if (!target) {
          target = document.createElement('div');
          target.className = 'guided-loading-unit-host';
          const grid = selector.querySelector('.loading-strategy-grid');
          if (grid) selector.insertBefore(target, grid);
          else selector.appendChild(target);
        }
        setHost(current => current === target ? current : target);
      });
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const sync = (event: Event) => setUnit((event as CustomEvent<GuidedLoadingUnit>).detail ?? readGuidedLoadingUnit());
    window.addEventListener(GUIDED_LOADING_UNIT_EVENT, sync);
    clickAppMode(unit);
    return () => window.removeEventListener(GUIDED_LOADING_UNIT_EVENT, sync);
  }, [unit]);

  const choose = (next: GuidedLoadingUnit) => {
    setUnit(next);
    writeGuidedLoadingUnit(next);
    clickAppMode(next);
  };

  if (!host) return null;
  return createPortal(
    <section className="guided-loading-unit-selector" aria-label="적재 단위 선택">
      <div className="guided-loading-unit-head"><b>적재 단위</b><span>제품 포장 결과를 상자로 직접 적재할지, 파렛트에 올린 뒤 적재할지 선택합니다.</span></div>
      <div className="guided-loading-unit-options">
        <button type="button" className={unit === 'boxes' ? 'active' : ''} onClick={() => choose('boxes')}>
          <i>▦</i><span><b>상자 적재</b><small>제품 포장에서 확정한 BOX를 그대로 차량/컨테이너에 적재</small></span>{unit === 'boxes' && <em>✓</em>}
        </button>
        <button type="button" className={unit === 'pallets' ? 'active' : ''} onClick={() => choose('pallets')}>
          <i>▤</i><span><b>파렛트 적재</b><small>확정 BOX를 파렛트에 구성한 뒤 파렛트 단위로 적재</small></span>{unit === 'pallets' && <em>✓</em>}
        </button>
      </div>
    </section>,
    host,
  );
}
