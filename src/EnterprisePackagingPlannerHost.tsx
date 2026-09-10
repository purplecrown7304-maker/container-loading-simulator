import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CompanyProductLoadingFlow from './CompanyProductLoadingFlow';
import EnterprisePackagingPlanner from './EnterprisePackagingPlanner';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT } from './enterprisePackagingPlannerStore';

const PLANNER_VIEW_STATE = 'enterprise-packaging';

type PlannerHistoryState = Record<string, unknown> & {
  containerLoadingView?: string;
};

function currentHistoryState(): PlannerHistoryState {
  const value = window.history.state;
  return value && typeof value === 'object' ? value as PlannerHistoryState : {};
}

function isPlannerHistoryEntry() {
  return currentHistoryState().containerLoadingView === PLANNER_VIEW_STATE;
}

function scrollToMain() {
  const main = document.querySelector('.mockup-dashboard');
  if (main instanceof HTMLElement) {
    main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function relabelGuidedWorkflow() {
  const stepButtons = [...document.querySelectorAll<HTMLElement>('.guided-step-list button')];
  const cargoStepLabel = stepButtons[1]?.querySelector<HTMLElement>('.guided-step-copy b');
  if (cargoStepLabel) cargoStepLabel.textContent = '제품 · 화물 선택';

  const stageTitle = document.querySelector<HTMLElement>('.guided-cargo-stage .guided-panel-title h1');
  if (stageTitle) stageTitle.textContent = '제품 · 화물 선택';

  const bottomButton = document.querySelector<HTMLButtonElement>('.guided-primary-cta');
  if (bottomButton && document.documentElement.dataset.guidedStep === '1') {
    bottomButton.textContent = '다음: 제품 · 화물 선택  ›';
  }
}

export default function EnterprisePackagingPlannerHost() {
  const [revision, setRevision] = useState(0);
  const [actionsTarget, setActionsTarget] = useState<Element | null>(null);
  const [guidedCargoTarget, setGuidedCargoTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);

  useEffect(() => {
    setActionsTarget(document.querySelector('.enterprise-packaging-planner .packaging-actions'));
  }, [revision]);

  useEffect(() => {
    let frame = 0;
    const syncGuidedTarget = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>('.guided-cargo-stage');
        setGuidedCargoTarget((current) => current === target ? current : target);
        relabelGuidedWorkflow();
      });
    };

    syncGuidedTarget();
    const observer = new MutationObserver(syncGuidedTarget);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onShortcutClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.product-packaging-shortcut')) return;
      event.preventDefault();
      event.stopPropagation();

      const guidedStepTwo = [...document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')][1];
      if (guidedStepTwo) {
        guidedStepTwo.click();
        window.setTimeout(() => document.querySelector('.guided-company-product-portal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        return;
      }

      if (!isPlannerHistoryEntry()) {
        window.history.pushState(
          { ...currentHistoryState(), containerLoadingView: PLANNER_VIEW_STATE },
          '',
          `${window.location.pathname}${window.location.search}#product-packaging-planner`,
        );
      }
      document.querySelector('.company-product-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const onPopState = () => {
      if (!isPlannerHistoryEntry()) scrollToMain();
    };

    document.addEventListener('click', onShortcutClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onShortcutClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const backToMain = useCallback(() => {
    if (isPlannerHistoryEntry()) {
      window.history.back();
      return;
    }

    if (window.location.hash === '#product-packaging-planner') {
      const nextState = { ...currentHistoryState() };
      delete nextState.containerLoadingView;
      window.history.replaceState(nextState, '', `${window.location.pathname}${window.location.search}`);
    }
    scrollToMain();
  }, []);

  const guidedProductFlow = guidedCargoTarget ? createPortal(
    <section className="guided-company-product-portal" aria-label="회사 제품 출하 설정">
      <div className="guided-company-product-intro">
        <div>
          <span>회사 제품 출하</span>
          <b>제품 등록 → 박스 추천 → 최종 적재</b>
          <small>제품 엑셀 업로드, 박스 필요 여부, 등록 박스 적합성, 제품별·범용 추천 상자를 여기서 설정합니다.</small>
        </div>
      </div>
      <CompanyProductLoadingFlow />
    </section>,
    guidedCargoTarget,
  ) : null;

  return <div className="enterprise-packaging-host">
    {guidedProductFlow ?? <CompanyProductLoadingFlow />}
    <details className="enterprise-advanced-details">
      <summary>고급 포장 설정 / 회사 박스 관리 / 비용 최적화</summary>
      <EnterprisePackagingPlanner key={revision} />
    </details>
    {actionsTarget && createPortal(
      <button
        type="button"
        className="enterprise-back-to-main"
        onClick={backToMain}
        style={{ order: -1 }}
      >
        ← 메인 적재 화면으로
      </button>,
      actionsTarget,
    )}
  </div>;
}
