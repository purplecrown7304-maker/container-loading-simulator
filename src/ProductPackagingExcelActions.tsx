import { excelIssueMessage } from './excelPresentation';
import { useUiMessage } from './useUiMessage';
import { uiText, useUiLanguage } from './uiLanguage';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import type { ContainerSpec } from './engine/types';
import { downloadProductPackagingTemplate, parseProductPackagingWorkbook } from './productPackagingExcel';
import { readStoredState } from './storage';

const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

export default function ProductPackagingExcelActions() {
  useUiLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [message, setMessage] = useUiMessage('');

  useEffect(() => {
    const timer = window.setTimeout(() => setTarget(document.querySelector('#product-packaging-planner .packaging-actions')), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await parseProductPackagingWorkbook(file);
      if (!imported.products.length) {
        window.alert(uiText("등록 가능한 제품이 없습니다.{0}", [imported.issues.length ? uiText("\n오류 {0}건을 확인하세요.", [imported.issues.length]) : '']));
        return;
      }
      const current = readEnterprisePackagingPlannerState();
      const issuePreview = imported.issues.slice(0, 5).map(issue => uiText("{0} {1}행: {2}", [issue.sheet, issue.row, excelIssueMessage(issue.message)])).join('\n');
      const confirmMessage = uiText("제품 {0}종{1}을 불러옵니다.{2}\n\n현재 기업 포장설계 목록을 교체할까요?", [imported.products.length, imported.boxes.length ? uiText(" · 박스 {0}종", [imported.boxes.length]) : '', imported.issues.length ? uiText("\n오류 {0}건은 제외됩니다.\n{1}", [imported.issues.length, issuePreview]) : '']);
      if (!window.confirm(confirmMessage)) return;
      const next: EnterprisePackagingPlannerState = {
        products: imported.products,
        boxes: imported.boxes.length ? imported.boxes : (current?.boxes ?? []),
        container: current?.container ?? readStoredState()?.container ?? defaultContainer,
        settings: current?.settings,
      };
      writeEnterprisePackagingPlannerState(next, true);
      setMessage(() => uiText("Excel 반영 완료 · 제품 {0}종{1}{2}", [imported.products.length, imported.boxes.length ? uiText(" · 박스 {0}종", [imported.boxes.length]) : '', imported.issues.length ? uiText(" · 제외 {0}건", [imported.issues.length]) : '']));
      document.getElementById('product-packaging-planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      window.alert(uiText('제품/박스 Excel 파일을 읽지 못했습니다. 양식을 다시 확인하세요.'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!target) return null;
  return createPortal(<>
    <button type="button" onClick={downloadProductPackagingTemplate}>{uiText("제품 Excel 양식")}</button>
    <button type="button" onClick={() => inputRef.current?.click()}>{uiText("제품 Excel 업로드")}</button>
    <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => void handleFile(event.target.files?.[0])} />
    {message && <span className="product-excel-message" role="status">{message}</span>}
  </>, target);
}
