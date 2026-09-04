import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { openWorkspace } from './uiEvents';

const OPEN_PHYSICS_VALIDATION_EVENT = 'container-loading:open-physics-validation';

function buttonText(button: HTMLButtonElement) {
  return (button.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function makeBoxSelectButton(source: HTMLButtonElement) {
  if (source.dataset.boxSelectorPatched === 'true') return;
  source.dataset.boxSelectorPatched = 'true';
  source.style.display = 'none';

  const replacement = document.createElement('button');
  replacement.type = 'button';
  replacement.className = `${source.className} box-select-replacement`.trim();
  replacement.textContent = '박스 선택';
  replacement.addEventListener('click', () => openWorkspace('boxes'));
  source.parentElement?.insertBefore(replacement, source);
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
      if (summary) summary.style.display = '';
    }
  });

  document.querySelectorAll<HTMLElement>('.empty-cargo span').forEach(node => {
    if ((node.textContent ?? '').includes('랜덤 샘플')) {
      node.textContent = '박스 선택을 눌러 등록된 박스 목록에서 적재할 화물을 고르세요.';
    }
  });

  document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    if (buttonText(button) === '샘플 복원') makeBoxSelectButton(button);
  });
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

    placeDock();
    const observer = new MutationObserver(placeDock);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
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
