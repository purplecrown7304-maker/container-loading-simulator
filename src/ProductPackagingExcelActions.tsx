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
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setTarget(document.querySelector('#product-packaging-planner .packaging-actions')), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await parseProductPackagingWorkbook(file);
      if (!imported.products.length) {
        window.alert(`등록 가능한 제품이 없습니다.${imported.issues.length ? `\n오류 ${imported.issues.length}건을 확인하세요.` : ''}`);
        return;
      }
      const current = readEnterprisePackagingPlannerState();
      const issuePreview = imported.issues.slice(0, 5).map(issue => `${issue.sheet} ${issue.row}행: ${issue.message}`).join('\n');
      const confirmMessage = `제품 ${imported.products.length}종${imported.boxes.length ? ` · 박스 ${imported.boxes.length}종` : ''}을 불러옵니다.${imported.issues.length ? `\n오류 ${imported.issues.length}건은 제외됩니다.\n${issuePreview}` : ''}\n\n현재 기업 포장설계 목록을 교체할까요?`;
      if (!window.confirm(confirmMessage)) return;
      const next: EnterprisePackagingPlannerState = {
        products: imported.products,
        boxes: imported.boxes.length ? imported.boxes : (current?.boxes ?? []),
        container: current?.container ?? readStoredState()?.container ?? defaultContainer,
        settings: current?.settings,
      };
      writeEnterprisePackagingPlannerState(next, true);
      setMessage(`Excel 반영 완료 · 제품 ${imported.products.length}종${imported.boxes.length ? ` · 박스 ${imported.boxes.length}종` : ''}${imported.issues.length ? ` · 제외 ${imported.issues.length}건` : ''}`);
      document.getElementById('product-packaging-planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      window.alert('제품/박스 Excel 파일을 읽지 못했습니다. 양식을 다시 확인하세요.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!target) return null;
  return createPortal(<>
    <button type="button" onClick={downloadProductPackagingTemplate}>제품 Excel 양식</button>
    <button type="button" onClick={() => inputRef.current?.click()}>제품 Excel 업로드</button>
    <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => void handleFile(event.target.files?.[0])} />
    {message && <span className="product-excel-message" role="status">{message}</span>}
  </>, target);
}
