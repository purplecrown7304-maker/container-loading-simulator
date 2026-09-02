import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import { APP_ACTION_EVENT, dispatchAppAction, type AppActionDetail } from './uiEvents';
import './viewer-final-actions.css';

function clickButton(selector: string, text?: string): boolean {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  const button = text ? buttons.find(item => item.textContent?.replace(/\s+/g, '').includes(text.replace(/\s+/g, ''))) : buttons[0];
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

export default function HeaderActionBridge() {
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<AppActionDetail>).detail?.action;
      if (!action) return;

      if (action === 'run-loading') {
        const started = clickButton('.quick-card .primary-action');
        if (started) window.dispatchEvent(new Event(FINAL_LOADING_WORKFLOW_START_EVENT));
        return;
      }
      if (action === 'show-results') {
        clickButton('.viewer-bottom-actions .result-open-action') || clickButton('.quick-card .result-open-action');
        return;
      }
      if (action === 'load-local') {
        clickButton('.mockup-topbar .top-actions.compact button', '불러오기');
        return;
      }
      if (action === 'save-local') {
        clickButton('.mockup-topbar .top-actions.compact button', '저장');
        return;
      }
      if (action === 'print-report') {
        clickButton('.mockup-topbar .top-actions.compact button', '작업지시서');
        return;
      }
      if (action === 'reset-all') {
        clickButton('.quick-card .danger.ghost');
        return;
      }
      if (action === 'viewer') {
        document.querySelector('.viewer-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action === 'dashboard') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener(APP_ACTION_EVENT, onAction);
    return () => window.removeEventListener(APP_ACTION_EVENT, onAction);
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      setFooterHost(document.querySelector<HTMLElement>('.viewer-bottom-actions'));
      setRunning(Boolean(document.querySelector('.calculation-overlay')) || Boolean(document.querySelector('.quick-card .primary-action:disabled')));
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!footerHost) return null;

  return createPortal(
    <div className="viewer-final-action-row" aria-label="최종 적재 작업">
      <button
        type="button"
        className="viewer-final-action primary"
        disabled={running}
        onClick={() => dispatchAppAction('run-loading')}
      >
        {running ? '최종 적재 진행 중…' : '최종 적재 진행'}
      </button>
      <button
        type="button"
        className="viewer-final-action report"
        disabled={running}
        onClick={() => dispatchAppAction('print-report')}
      >
        작업지시서 발급
      </button>
      <button
        type="button"
        className="viewer-final-action reset"
        disabled={running}
        onClick={() => dispatchAppAction('reset-all')}
      >
        전체 초기화
      </button>
    </div>,
    footerHost,
  );
}
