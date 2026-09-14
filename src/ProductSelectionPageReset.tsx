import { useEffect } from 'react';
import { PRODUCT_SELECTION_EVENT, PRODUCT_SELECTION_KEY } from './productWorkflow';
import { readStoredState, writeStoredState } from './storage';

const SHIPMENT_SNAPSHOT_KEY = 'container-loading-shipment-instruction-v1';
let resetDone = false;

/**
 * 제품 선택 수량은 작업 세션 값이다. 새로고침하면 이전 수량/포장 확정값을 재사용하지 않는다.
 * 회사 제품/박스 라이브러리 자체는 건드리지 않고 현재 출하 준비값만 초기화한다.
 */
export default function ProductSelectionPageReset() {
  useEffect(() => {
    if (resetDone) return;
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

    window.dispatchEvent(new CustomEvent(PRODUCT_SELECTION_EVENT, { detail: {} }));
  }, []);

  return null;
}
