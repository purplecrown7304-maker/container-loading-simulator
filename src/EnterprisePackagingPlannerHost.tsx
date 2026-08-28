import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

export default function EnterprisePackagingPlannerHost() {
  const [revision, setRevision] = useState(0);
  const [actionsTarget, setActionsTarget] = useState<Element | null>(null);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);

  useEffect(() => {
    setActionsTarget(document.querySelector('.enterprise-packaging-planner .packaging-actions'));
  }, [revision]);

  useEffect(() => {
    const onShortcutClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.product-packaging-shortcut')) return;
      if (isPlannerHistoryEntry()) return;

      window.history.pushState(
        { ...currentHistoryState(), containerLoadingView: PLANNER_VIEW_STATE },
        '',
        `${window.location.pathname}${window.location.search}#product-packaging-planner`,
      );
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

  return <div className="enterprise-packaging-host">
    <EnterprisePackagingPlanner key={revision} />
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
