import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuidedWorkflowState } from './guidedWorkflowState';
import {
  guidedLoadingUnitLabel,
  publishGuidedLoadingUnit,
  readGuidedLoadingUnit,
  useGuidedLoadingUnit,
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

  const selector = guidedWorkflow.active && guidedWorkflow.step === 4 && strategyHost ? createPortal(
    <section className="guided-loading-unit-inline" aria-label="적재 유형 선택">
      <div className="guided-loading-unit-block">
        <div className="guided-loading-unit-heading">
          <div><b>1. 화물 유형</b><span>기존 박스/파렛트 전역 모드를 사용하지 않습니다. 각 화물에 load-sim 유형을 지정합니다.</span></div>
          <strong className="ready">{guidedLoadingUnitLabel(unit ?? 'boxes')}</strong>
        </div>
        <div className="guided-loading-unit-grid" aria-label="load-sim 화물 유형">
          <div className="selected"><i>✓</i><span><b>루즈 카톤 · 파렛트 · 드럼 · 톤백/포대 · 롤/코일 · 장척물 · 기계/중량물</b><small>품목별 유형에 따라 회전, 지게차, 적층, 하역 규칙이 자동 적용됩니다.</small></span></div>
        </div>
        <div className="guided-loading-unit-divider"><span>2. 배치 실행</span></div>
      </div>
    </section>,
    strategyHost,
  ) : null;

  return selector;
}
