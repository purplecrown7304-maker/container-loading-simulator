import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadCargoTemplate, parseCargoWorkbook } from './excel';
import type { CargoItem, ContainerSpec } from './engine/types';

const STORAGE_KEY = 'container-loading-simulator-v1';

type StoredState = {
  container: ContainerSpec;
  cargo: CargoItem[];
};

export default function ExcelImportActions() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPortalTarget(document.querySelector('.top-actions'));
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    try {
      const result = await parseCargoWorkbook(file);
      if (result.items.length === 0) {
        setMessage(`등록 가능한 행이 없습니다. 오류 ${result.issues.length}건`);
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      const current = raw ? (JSON.parse(raw) as StoredState) : null;
      const next: StoredState = {
        container: current?.container ?? {
          length: 12.03,
          width: 2.35,
          height: 2.69,
          maxPayloadKg: 26500,
        },
        cargo: result.items,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setMessage(`엑셀 ${result.items.length}건 등록 · 오류 ${result.issues.length}건`);
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setMessage('엑셀 파일을 읽지 못했습니다. 형식을 확인해 주세요.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <>
      <button className="secondary" onClick={downloadCargoTemplate}>엑셀 양식</button>
      <button className="secondary" onClick={() => inputRef.current?.click()}>엑셀 업로드</button>
      <input
        ref={inputRef}
        className="hidden-file-input"
        type="file"
        accept=".xlsx,.xls"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {message && <span className="excel-message">{message}</span>}
    </>,
    portalTarget,
  );
}
