import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportLoadingDiagnostics } from './diagnosticExport';

export default function DiagnosticExportResultButton() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const title = document.querySelector<HTMLElement>('.guided-result-stage .guided-panel-title');
        setHost(title);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-guided-step', 'class'] });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!host) return null;

  const run = async () => {
    const exported = await exportLoadingDiagnostics();
    if (!exported.ok) window.alert(exported.message);
  };

  return createPortal(
    <button type="button" className="guided-secondary-button diagnostic-export-result-button" onClick={() => void run()}>
      점검 파일 내보내기
    </button>,
    host,
  );
}
