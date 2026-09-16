import { useEffect, useRef, useState } from 'react';
import { SUPABASE_URL, supabasePublicHeaders } from './supabaseConfig';
import './diagnostic-auto-mail.css';

const DIAGNOSTIC_MAIL_ENDPOINT = `${SUPABASE_URL}/functions/v1/container-diagnostic-mail`;
export const DIAGNOSTIC_RECIPIENT = 'qkrgudtls7304@gmail.com';
const DIAGNOSTIC_PREFIX = 'loading-system-check-';

type MailStatus = { tone: 'sending' | 'success' | 'error'; text: string } | null;

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('점검 ZIP을 메일 전송용으로 읽지 못했습니다.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      if (comma < 0) return reject(new Error('점검 ZIP 인코딩에 실패했습니다.'));
      resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function sendDiagnosticZip(blobUrl: string, filename: string) {
  const source = await fetch(blobUrl);
  if (!source.ok) throw new Error('생성된 점검 ZIP을 읽지 못했습니다.');
  const blob = await source.blob();
  if (blob.size <= 0) throw new Error('생성된 점검 ZIP이 비어 있습니다.');
  if (blob.size > 12 * 1024 * 1024) throw new Error('점검 ZIP이 12MB를 넘어 메일 전송을 중단했습니다.');
  const zipBase64 = await blobToBase64(blob);

  const response = await fetch(DIAGNOSTIC_MAIL_ENDPOINT, {
    method: 'POST',
    headers: supabasePublicHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename, zipBase64 }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Supabase 점검 메일 발송에 실패했습니다.');
}

export default function DiagnosticAutoMailBridge() {
  const [status, setStatus] = useState<MailStatus>(null);
  const sendingFiles = useRef(new Set<string>());
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const show = (next: NonNullable<MailStatus>, duration = 4500) => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      setStatus(next);
      if (next.tone !== 'sending') hideTimer.current = window.setTimeout(() => setStatus(null), duration);
    };

    const onDownload = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[download]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const filename = anchor.download.trim();
      if (!filename.startsWith(DIAGNOSTIC_PREFIX) || !filename.endsWith('.zip')) return;

      // 점검 파일은 사용자 PC에 내려받지 않고 지정된 진단 메일함으로 바로 보낸다.
      // exportLoadingDiagnosticsV2가 생성하는 임시 download 링크의 기본 다운로드 동작을 여기서 차단한다.
      event.preventDefault();

      if (sendingFiles.current.has(filename)) return;
      sendingFiles.current.add(filename);
      const blobUrl = anchor.href;

      show({ tone: 'sending', text: `점검 파일을 ${DIAGNOSTIC_RECIPIENT}으로 전송 중…` });
      void sendDiagnosticZip(blobUrl, filename)
        .then(() => show({ tone: 'success', text: `점검 파일을 ${DIAGNOSTIC_RECIPIENT}으로 전송했습니다.` }))
        .catch(error => {
          show({ tone: 'error', text: error instanceof Error ? error.message : '점검 파일 메일 전송에 실패했습니다.' }, 7000);
        })
        .finally(() => {
          sendingFiles.current.delete(filename);
        });
    };

    document.addEventListener('click', onDownload, true);
    return () => {
      document.removeEventListener('click', onDownload, true);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!status) return null;
  return <div className={`diagnostic-auto-mail-toast ${status.tone}`} role="status" aria-live="polite">{status.text}</div>;
}
