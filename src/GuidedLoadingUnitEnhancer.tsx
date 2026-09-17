import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';
import { readPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';
import { readProductSelection } from './productWorkflow';
import { useGuidedWorkflowState } from './guidedWorkflowState';
import {
  guidedLoadingUnitLabel,
  publishGuidedLoadingUnit,
  readGuidedLoadingUnit,
  useGuidedLoadingUnit,
  type GuidedLoadingUnit,
} from './guidedLoadingUnitState';

function strategyLabel() {
  const strategy = readLoadingStrategyPreference();
  if (strategy === 'stability') return '무게중심·안정성 우선형';
  if (strategy === 'capacity') return '공간효율·적재량 우선형';
  if (strategy === 'unloading') return '하역 순서 우선형';
  return '전략 미선택';
}

function selectionLabel() {
  const selection = readProductSelection();
  const productCount = Object.keys(selection).length;
  const units = Object.values(selection).reduce((sum, quantity) => sum + quantity, 0);
  return productCount ? `${productCount}종 · ${units.toLocaleString()} EA` : '선택 제품 없음';
}

export default function GuidedLoadingUnitEnhancer() {
  const guidedWorkflow = useGuidedWorkflowState();
  const unit = useGuidedLoadingUnit();
  const [strategyHost, setStrategyHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!guidedWorkflow.active || guidedWorkflow.step <= 3) {
      if (unit !== null) publishGuidedLoadingUnit(null);
      return;
    }

    if (guidedWorkflow.step === 4 && unit === null) {
      publishGuidedLoadingUnit(readGuidedLoadingUnit() ?? 'boxes');
      return;
    }

    // PalletModePanel은 3D 화면이 unmount될 때 legacy window mirror를 비운다.
    // 실제 snapshot store는 결과를 유지하므로 6단계 진입 시 검증된 snapshot을 다시 mirror하고
    // 기존 결과/리포트 소비자에게 같은 업데이트 이벤트를 전달한다.
    if (guidedWorkflow.step === 6 && unit === 'pallets') {
      const snapshot = readPalletSnapshot();
      if (snapshot) publishPalletSnapshot(snapshot, { preserveCertification: true });
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

  const selectedStrategyLabel = useMemo(
    () => strategyLabel(),
    [guidedWorkflow.step, unit],
  );
  const selectedProductsLabel = useMemo(
    () => selectionLabel(),
    [guidedWorkflow.step, unit],
  );

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
        <div className="guided-loading-unit-divider"><span>2. 적재 전략</span></div>
      </div>
    </section>,
    strategyHost,
  ) : null;

  const runningBadge = guidedWorkflow.active && guidedWorkflow.step === 5 && unit && typeof document !== 'undefined' ? createPortal(
    <div className="guided-loading-run-confirmation" aria-live="polite" aria-label="자동 적재 실행 설정 확인">
      <b>실행 설정 확인</b>
      <span>{guidedLoadingUnitLabel(unit)} · {selectedStrategyLabel} · {selectedProductsLabel}</span>
      <small>아래의 ‘최종 적재 진행’을 누르면 이 설정으로 관성·물리 검증을 시작합니다.</small>
    </div>,
    document.body,
  ) : null;

  return <>{selector}{runningBadge}</>;
}
