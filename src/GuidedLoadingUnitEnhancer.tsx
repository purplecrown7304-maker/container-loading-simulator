import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import GuidedPalletTypePicker from './GuidedPalletTypePicker';
import { useGuidedWorkflowState } from './guidedWorkflowState';
import {
  guidedLoadingUnitLabel,
  publishGuidedLoadingUnit,
  readGuidedLoadingUnit,
  useGuidedLoadingUnit,
  type GuidedLoadingUnit,
} from './guidedLoadingUnitState';

export default function GuidedLoadingUnitEnhancer() {
  const guidedWorkflow = useGuidedWorkflowState();
  const unit = useGuidedLoadingUnit();
  const [strategyHost, setStrategyHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!guidedWorkflow.active) {
      if (unit !== null) publishGuidedLoadingUnit(null);
      return;
    }

    if (guidedWorkflow.step === 4 && unit === null) {
      publishGuidedLoadingUnit(readGuidedLoadingUnit() ?? 'boxes');
      return;
    }

  }, [guidedWorkflow.active, guidedWorkflow.step, unit]);

  useEffect(() => {
    if (!guidedWorkflow.active || guidedWorkflow.step !== 4) {
      setStrategyHost(null);
      return;
    }

    let observer: MutationObserver | null = null;
    const resolveHost = () => {
      const host = document.querySelector<HTMLElement>('.guided-strategy-stage');
      if (!host) return false;
      setStrategyHost(current => current === host ? current : host);
      observer?.disconnect();
      observer = null;
      return true;
    };

    if (!resolveHost()) {
      observer = new MutationObserver(resolveHost);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, [guidedWorkflow.active, guidedWorkflow.step]);

  useEffect(() => {
    if (unit) document.documentElement.dataset.guidedLoadingUnit = unit;
    else delete document.documentElement.dataset.guidedLoadingUnit;
    return () => { delete document.documentElement.dataset.guidedLoadingUnit; };
  }, [unit]);

  const choose = (next: GuidedLoadingUnit) => publishGuidedLoadingUnit(next);

  const selector = guidedWorkflow.active && guidedWorkflow.step === 4 && strategyHost ? createPortal(
    <section className="guided-loading-unit-inline" aria-label="적재 유형 선택">
      <div className="guided-loading-unit-block">
        <div className="guided-loading-unit-heading">
          <div><b>1. 적재 유형</b><span>포장된 화물을 박스로 직접 적재할지, 파렛트 단위로 적재할지 선택합니다.</span></div>
          <strong className={unit ? 'ready' : ''}>{guidedLoadingUnitLabel(unit)}</strong>
        </div>
        <div className="guided-loading-unit-grid" role="radiogroup" aria-label="박스 또는 파렛트 선택">
          <button type="button" role="radio" aria-checked={unit === 'boxes'} className={unit === 'boxes' ? 'selected' : ''} onClick={() => choose('boxes')}>
            <i>{unit === 'boxes' ? '✓' : '□'}</i><span><b>박스 직접 적재</b><small>포장된 박스를 컨테이너·트럭 바닥에 직접 최적 배치합니다.</small></span>
          </button>
          <button type="button" role="radio" aria-checked={unit === 'pallets'} className={unit === 'pallets' ? 'selected' : ''} onClick={() => choose('pallets')}>
            <i>{unit === 'pallets' ? '✓' : '▤'}</i><span><b>파렛트 적재</b><small>포장된 박스를 파렛트에 구성한 뒤 파렛트 단위로 최적 배치합니다.</small></span>
          </button>
        </div>
        {unit === 'pallets' && <GuidedPalletTypePicker />}
        <div className="guided-loading-unit-divider"><span>2. 적재 전략</span></div>
      </div>
    </section>,
    strategyHost,
  ) : null;

  return selector;
}
