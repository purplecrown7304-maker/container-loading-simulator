import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { openPalletLoadingReport, type PalletWorkSnapshot } from './palletWorkerReportV2';
import { openLoadingReport } from './report';
import { openWorkspace } from './uiEvents';

const OPEN_PHYSICS_VALIDATION_EVENT = 'container-loading:open-physics-validation';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type DashboardWindow = Window & {
  __containerLoadingLatestResult?: LoadingDetail;
  __containerLoadingPalletSnapshot?: PalletWorkSnapshot;
};

function buttonText(button: HTMLButtonElement) {
  return (button.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function patchCargoUi() {
  document.querySelectorAll<HTMLElement>('.onboarding-banner').forEach(node => {
    node.style.display = 'none';
  });

  document.querySelectorAll<HTMLParagraphElement>('.status-message').forEach(node => {
    const initialGuide = (node.textContent ?? '').includes('처음 시작합니다.');
    node.style.display = initialGuide ? 'none' : '';
  });

  document.querySelectorAll<HTMLDetailsElement>('.cargo-add-panel').forEach(panel => {
    const summary = panel.querySelector<HTMLElement>('summary');
    if (panel.open) {
      panel.style.display = '';
      if (summary) summary.style.display = 'none';
    } else {
      panel.style.display = 'none';
    }
  });

  // 이전 구현은 화면의 모든 '샘플 복원' 버튼마다 새 '박스 선택' 버튼을 삽입해
  // 빈 화물 카드에 버튼이 중복됐다. 이제 기존 빈 상태 버튼 하나만 재사용한다.
  const empty = document.querySelector<HTMLElement>('.cargo-browser .empty-cargo');
  if (empty) {
    const title = empty.querySelector<HTMLElement>('b');
    const guide = empty.querySelector<HTMLElement>('span');
    if (title && title.textContent !== '등록된 화물이 없습니다.') title.textContent = '등록된 화물이 없습니다.';
    const guideText = '박스 선택을 눌러 등록된 박스 목록에서 적재할 화물을 고르세요.';
    if (guide && guide.textContent !== guideText) guide.textContent = guideText;

    const buttons = [...empty.querySelectorAll<HTMLButtonElement>('button')];
    buttons.forEach((button, index) => {
      if (index === 0) {
        if (button.textContent !== '박스 선택') button.textContent = '박스 선택';
        button.dataset.singleBoxSelector = 'true';
        button.style.display = '';
      } else {
        button.style.display = 'none';
      }
    });
  }

  // 빠른 작업의 옛 샘플 복원/대체 박스선택은 제거한다.
  document.querySelectorAll<HTMLButtonElement>('.quick-card button').forEach(button => {
    const text = buttonText(button);
    if (text === '샘플 복원' || button.classList.contains('box-select-replacement')) button.style.display = 'none';
  });
}

function currentMode(): 'boxes' | 'pallets' {
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
}

function openBoxWorkOrder(detail: LoadingDetail) {
  openLoadingReport(detail.container, detail.cargo, detail.result);
}

function openPalletWorkOrder(detail: LoadingDetail, snapshot: PalletWorkSnapshot | undefined) {
  if (!snapshot) { window.alert('현재 팔레트 적재 결과가 없습니다.'); return; }
  openPalletLoadingReport(detail.container, detail.cargo);
}

export default function DashboardCommandDock() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const dockHost = document.createElement('div');
    dockHost.className = 'dashboard-test-dock-host';

    const placeDock = () => {
      const sidebar = document.querySelector<HTMLElement>('.dashboard-right');
      const summary = document.querySelector<HTMLElement>('.operational-right-summary');
      if (!sidebar) return;
      if (summary?.parentElement === sidebar) {
        if (summary.nextElementSibling !== dockHost) summary.insertAdjacentElement('afterend', dockHost);
      } else if (!dockHost.isConnected) {
        sidebar.appendChild(dockHost);
      }
      setHost(current => current ?? dockHost);
      patchCargoUi();
    };

    const onClickCapture = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
      if (!button) return;

      if (button.dataset.singleBoxSelector === 'true') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openWorkspace('boxes');
        return;
      }

      const text = buttonText(button);
      if (text !== '작업지시서' && text !== '작업 지시서') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const dashboard = window as DashboardWindow;
      const detail = dashboard.__containerLoadingLatestResult;
      if (!detail) {
        window.alert('작업지시서를 만들 적재 결과가 없습니다. 자동 적재를 먼저 실행하세요.');
        return;
      }

      if (currentMode() === 'pallets') openPalletWorkOrder(detail, dashboard.__containerLoadingPalletSnapshot);
      else openBoxWorkOrder(detail);
    };

    placeDock();
    const observer = new MutationObserver(placeDock);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', onClickCapture, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClickCapture, true);
      dockHost.remove();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <section className="dashboard-card dashboard-test-dock" aria-label="테스트 도구">
      <h2>테스트 도구</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="result-open-action"
          onClick={() => window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT))}
        >
          물리 안정성 종합검증
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT))}
        >
          관성 테스트
        </button>
      </div>
    </section>,
    host,
  );
}
