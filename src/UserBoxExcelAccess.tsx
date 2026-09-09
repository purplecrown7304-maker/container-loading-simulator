import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EXCEL_IMPORT_EVENT } from './uiEvents';

export default function UserBoxExcelAccess() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const actions = document.querySelector<HTMLElement>('.box-selector-actions > div:first-child');
        if (!actions) {
          setHost(null);
          return;
        }
        actions.querySelectorAll<HTMLButtonElement>('button[disabled]').forEach(button => {
          if ((button.textContent ?? '').includes('관리자 전용')) button.style.display = 'none';
        });
        let nextHost = actions.querySelector<HTMLElement>('.user-box-excel-access-host');
        if (!nextHost) {
          nextHost = document.createElement('span');
          nextHost.className = 'user-box-excel-access-host';
          actions.prepend(nextHost);
        }
        setHost(nextHost);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <button
      type="button"
      className="user-box-excel-add"
      onClick={() => window.dispatchEvent(new CustomEvent(EXCEL_IMPORT_EVENT, { detail: { action: 'upload', mode: 'merge' } }))}
      title="일반 이용자도 Excel 파일로 현재 적재 목록에 신규 박스를 추가할 수 있습니다."
    >
      Excel로 신규 박스 추가
    </button>,
    host,
  );
}
