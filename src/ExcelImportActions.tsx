import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadCargoTemplate, parseCargoWorkbook, type ImportIssue } from './excel';
import type { CargoItem, ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState, type StoredState } from './storage';
import { EXCEL_IMPORT_EVENT, type ExcelImportDetail, type ExcelImportMode } from './uiEvents';

const defaultContainer: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

export default function ExcelImportActions() {
  const inputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<ExcelImportMode>('replace');
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const onExcelAction = (event: Event) => {
      const detail = (event as CustomEvent<ExcelImportDetail>).detail;
      if (!detail) return;
      if (detail.action === 'template') {
        downloadCargoTemplate();
        setMessage('엑셀 양식을 다운로드했습니다.');
        return;
      }
      modeRef.current = detail.mode ?? 'replace';
      inputRef.current?.click();
    };
    window.addEventListener(EXCEL_IMPORT_EVENT, onExcelAction);
    return () => window.removeEventListener(EXCEL_IMPORT_EVENT, onExcelAction);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const mode = modeRef.current;

    try {
      const result = await parseCargoWorkbook(file);
      const current = readStoredState();
      const currentCargo = current?.cargo ?? [];
      let nextCargo: CargoItem[] = result.items;
      let newCount = result.items.length;
      let updatedCount = 0;

      if (mode === 'merge') {
        const map = new Map(currentCargo.map(item => [item.id, item]));
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

  return <>
    <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={event => void handleFile(event.target.files?.[0])} />
    {message && <button className="excel-import-toast" type="button" onClick={() => issues.length && setShowReport(true)}>{message}</button>}
    {showReport && issues.length > 0 && createPortal(
      <div className="excel-report-backdrop" onClick={() => setShowReport(false)}>
        <section className="excel-report" onClick={event => event.stopPropagation()}>
          <div className="excel-report-head">
            <div><strong>엑셀 업로드 오류 상세</strong><span>{issues.length}건</span></div>
            <button className="secondary" onClick={() => setShowReport(false)}>닫기</button>
          </div>
          <div className="excel-report-list">
            {issues.map((issue, index) => <article key={`${issue.row}-${index}`}>
              <b>{issue.row > 0 ? `${issue.row}행` : '파일 오류'}</b>
              <span>{issue.code ? `[${issue.code}] ` : ''}{issue.message}</span>
            </article>)}
          </div>
        </section>
      </div>,
      document.body,
    )}
  </>;
}
