import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadCargoTemplate, parseCargoWorkbook, type ImportIssue } from './excel';
import type { CargoItem, ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState, type StoredState } from './storage';

type ImportMode = 'replace' | 'merge';

const defaultContainer: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

export default function ExcelImportActions() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<ImportMode>('replace');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setPortalTarget(document.querySelector('.top-actions'));
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    try {
      const result = await parseCargoWorkbook(file);
      const current = readStoredState();
      const currentCargo = current?.cargo ?? [];
      let nextCargo: CargoItem[] = result.items;
      let newCount = result.items.length;
      let updatedCount = 0;

      if (mode === 'merge') {
        const map = new Map(currentCargo.map((item) => [item.id, item]));
        newCount = 0;
        for (const item of result.items) {
          if (map.has(item.id)) updatedCount += 1;
          else newCount += 1;
          map.set(item.id, item);
        }
        nextCargo = [...map.values()];
      }

      if (result.items.length === 0) {
        setMessage(`등록 가능한 행이 없습니다 · 오류 ${result.issues.length}건`);
        setIssues(result.issues);
        setShowReport(true);
        return;
      }

      const next: StoredState = {
        container: current?.container ?? defaultContainer,
        cargo: nextCargo,
      };

      writeStoredState(next, true);
      setIssues(result.issues);
      if (mode === 'replace') {
        setMessage(`${result.totalRows}행 처리 · ${result.items.length}건 등록 · 오류 ${result.issues.length}건 · 전체 교체`);
      } else {
        setMessage(`${result.totalRows}행 처리 · 신규 ${newCount}건 · 갱신 ${updatedCount}건 · 오류 ${result.issues.length}건 · 병합`);
      }
      setShowReport(result.issues.length > 0);
    } catch {
      setIssues([{ row: 0, message: '엑셀 파일을 읽지 못했습니다. 파일 형식 또는 시트를 확인하세요.' }]);
      setMessage('엑셀 업로드 실패');
      setShowReport(true);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <>
      <details className="excel-import-menu">
        <summary>Excel</summary>
        <div className="excel-import-popover">
          <label>
            <span>가져오기 방식</span>
            <select className="excel-mode-select" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)} aria-label="엑셀 가져오기 방식">
              <option value="replace">전체 교체</option>
              <option value="merge">병합</option>
            </select>
          </label>
          <button className="secondary" onClick={downloadCargoTemplate}>엑셀 양식 다운로드</button>
          <button className="secondary" onClick={() => inputRef.current?.click()}>엑셀 파일 업로드</button>
          {message && <button className="excel-message" onClick={() => issues.length && setShowReport(true)}>{message}</button>}
        </div>
      </details>
      <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => void handleFile(event.target.files?.[0])} />
      {showReport && issues.length > 0 && createPortal(
        <div className="excel-report-backdrop" onClick={() => setShowReport(false)}>
          <section className="excel-report" onClick={(e) => e.stopPropagation()}>
            <div className="excel-report-head">
              <div><strong>엑셀 업로드 오류 상세</strong><span>{issues.length}건</span></div>
              <button className="secondary" onClick={() => setShowReport(false)}>닫기</button>
            </div>
            <div className="excel-report-list">
              {issues.map((issue, index) => (
                <article key={`${issue.row}-${index}`}>
                  <b>{issue.row > 0 ? `${issue.row}행` : '파일 오류'}</b>
                  <span>{issue.code ? `[${issue.code}] ` : ''}{issue.message}</span>
                </article>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>,
    portalTarget,
  );
}
