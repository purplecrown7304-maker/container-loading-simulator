import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);

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
    <div
      className="enterprise-packaging-backbar"
      style={{
        position: 'sticky',
        top: 8,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: 'fit-content',
        margin: '12px 0 8px 26px',
        padding: '6px',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.96)',
        boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
      }}
    >
      <button
        type="button"
        className="enterprise-back-to-main"
        onClick={backToMain}
        style={{
          minHeight: 36,
          padding: '7px 12px',
          border: '1px solid #94a3b8',
          borderRadius: 8,
          background: '#ffffff',
          color: '#172033',
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        ← 메인 적재 화면으로
      </button>
      <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>입력한 제품/박스 정보는 유지됩니다.</span>
    </div>
    <EnterprisePackagingPlanner key={revision} />
  </div>;
}
