import { useEffect } from 'react';
import { PRODUCT_SELECTION_EVENT, PRODUCT_SELECTION_KEY } from './productWorkflow';
import { readStoredState, writeStoredState } from './storage';

const SHIPMENT_SNAPSHOT_KEY = 'container-loading-shipment-instruction-v1';
let resetDone = false;

function resetProductPreparationForPageLoad() {
  if (typeof window === 'undefined' || resetDone) return;
  resetDone = true;

  const remove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key === PRODUCT_SELECTION_KEY || key?.startsWith(`${PRODUCT_SELECTION_KEY}:`)) remove.push(key);
  }
  remove.forEach(key => window.localStorage.removeItem(key));
  window.localStorage.removeItem(SHIPMENT_SNAPSHOT_KEY);

  const stored = readStoredState();
  const hasProductFlowCargo = stored?.cargo.some(item => Boolean(item.productId) || item.id.startsWith('PKG-') || item.id.startsWith('DIRECT-')) ?? false;
  if (stored && hasProductFlowCargo) writeStoredState({ container: stored.container, cargo: [] }, true);
}

// React가 첫 화면을 그리기 전에 이전 제품 수량/포장 cargo를 지운다.
// 그래야 GuidedWorkflowShell의 initialSelection에도 이전 값이 한 프레임도 들어가지 않는다.
resetProductPreparationForPageLoad();

/** 제품 선택 수량은 새로고침마다 0에서 시작한다. */
export default function ProductSelectionPageReset() {
  useEffect(() => {
    resetProductPreparationForPageLoad();
    window.dispatchEvent(new CustomEvent(PRODUCT_SELECTION_EVENT, { detail: {} }));
  }, []);

  return null;
}
