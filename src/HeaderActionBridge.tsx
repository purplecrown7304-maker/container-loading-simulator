import { useEffect } from 'react';
import { FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

function clickButton(selector: string, text?: string): boolean {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  const button = text ? buttons.find(item => item.textContent?.replace(/\s+/g, '').includes(text.replace(/\s+/g, ''))) : buttons[0];
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

export default function HeaderActionBridge() {
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

  return null;
}
