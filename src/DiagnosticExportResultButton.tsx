import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DIAGNOSTIC_RECIPIENT } from './DiagnosticAutoMailBridge';
import { exportLoadingDiagnosticsV2 } from './diagnosticExportV2';

export default function DiagnosticExportResultButton() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [preparing, setPreparing] = useState(false);

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
    if (preparing) return;
    setPreparing(true);
    try {
      const exported = await exportLoadingDiagnosticsV2();
      if (!exported.ok) window.alert(exported.message);
    } finally {
      setPreparing(false);
    }
  };

  return createPortal(
    <button
      type="button"
      className="guided-secondary-button diagnostic-export-result-button"
      onClick={() => void run()}
      disabled={preparing}
      title={`생성한 점검 ZIP을 ${DIAGNOSTIC_RECIPIENT}으로 전송합니다.`}
    >
      {preparing ? '점검 파일 준비 중…' : '점검 파일 메일 전송'}
    </button>,
    host,
  );
}
