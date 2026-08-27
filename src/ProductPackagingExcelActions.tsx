import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { downloadProductPackagingTemplate, parseProductPackagingWorkbook } from './productPackagingExcel';
import { readStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };
type StoredPlanner = { products: ProductItem[]; boxes: BoxCatalogItem[]; container: ContainerSpec };

function readPlanner(): StoredPlanner | null {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

export default function ProductPackagingExcelActions() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Element | null>(null);

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
      const current = readPlanner();
      const issuePreview = imported.issues.slice(0, 5).map(issue => `${issue.sheet} ${issue.row}행: ${issue.message}`).join('\n');
      const message = `제품 ${imported.products.length}종${imported.boxes.length ? ` · 박스 ${imported.boxes.length}종` : ''}을 불러옵니다.${imported.issues.length ? `\n오류 ${imported.issues.length}건은 제외됩니다.\n${issuePreview}` : ''}\n\n현재 기업 포장설계 목록을 교체할까요?`;
      if (!window.confirm(message)) return;
      const next: StoredPlanner = {
        products: imported.products,
        boxes: imported.boxes.length ? imported.boxes : (current?.boxes ?? []),
        container: current?.container ?? readStoredState()?.container ?? defaultContainer,
      };
      localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(next));
      window.location.reload();
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
    <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={event => void handleFile(event.target.files?.[0])} />
  </>, target);
}
