import { useEffect } from 'react';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT, readEnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { CargoItem } from './engine/types';
import { LOCAL_OPERATOR_EVENT, operatorScopedStorageKey, readLocalOperator } from './localOperator';
import { openWorkspace } from './uiEvents';

const USER_CATALOG_KEY = 'container-loading-user-box-catalog-v1';
const EPS = 0.0005;

function readPersonalCatalog(key: string): CargoItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed as CargoItem[] : [];
  } catch {
    return [];
  }
}

function sameDimensions(cargo: CargoItem, box: BoxCatalogItem) {
  const direct = Math.abs(cargo.length - box.outerLength) <= EPS
    && Math.abs(cargo.width - box.outerWidth) <= EPS
    && Math.abs(cargo.height - box.outerHeight) <= EPS;
  const rotated = Math.abs(cargo.length - box.outerWidth) <= EPS
    && Math.abs(cargo.width - box.outerLength) <= EPS
    && Math.abs(cargo.height - box.outerHeight) <= EPS;
  return direct || rotated;
}

function toPersonalCatalogItem(box: BoxCatalogItem): CargoItem {
  const maxStackLayers = box.maxTopLoadKg == null
    ? undefined
    : Math.max(1, 1 + Math.floor(box.maxTopLoadKg / Math.max(0.001, box.maxGrossWeightKg)));
  return {
    id: box.id,
    name: box.name,
    length: box.outerLength,
    width: box.outerWidth,
    height: box.outerHeight,
    // 추천 박스는 실제 내용물 중량이 확정되기 전이므로 과소평가하지 않도록
    // 개인 박스 목록의 필수 중량에는 허용 총중량을 보수적으로 사용한다.
    weightKg: Math.max(0.001, box.maxGrossWeightKg),
    quantity: 0,
    maxStackLayers,
    maxTopLoadKg: box.maxTopLoadKg,
    allowRotation: true,
  };
}

function syncPlannerBoxesToPersonalCatalog() {
  const operator = readLocalOperator();
  const planner = readEnterprisePackagingPlannerState();
  if (!operator || !planner?.boxes?.length) return false;

  const key = operatorScopedStorageKey(USER_CATALOG_KEY, operator);
  const current = readPersonalCatalog(key);
  const next = [...current];
  let changed = false;

  for (const box of planner.boxes) {
    const exists = next.some(item => item.id === box.id || sameDimensions(item, box));
    if (exists) continue;
    next.push(toPersonalCatalogItem(box));
    changed = true;
  }

  if (!changed) return false;
  window.localStorage.setItem(key, JSON.stringify(next));
  return true;
}

function preferOwnedPackagingOptions() {
  document.querySelectorAll<HTMLSelectElement>('.guided-package-choice select').forEach(select => {
    const options = [...select.options];
    const owned = options.filter(option => option.textContent?.includes('보유'));
    if (!owned.length) return;

    const generated = options.filter(option => !option.textContent?.includes('보유'));
    const desired = [...owned, ...generated];
    const alreadyOrdered = options.every((option, index) => option === desired[index]);
    if (!alreadyOrdered) {
      for (const option of desired) select.appendChild(option);
    }

    [...select.options].forEach((option, index) => {
      const currentText = option.textContent ?? '';
      const nextText = currentText.replace(/^\d+순위/, `${index + 1}순위`);
      if (nextText !== currentText) option.textContent = nextText;
    });

    const current = select.selectedOptions[0];
    if (current?.textContent?.includes('보유')) return;
    const firstOwned = [...select.options].find(option => option.textContent?.includes('보유'));
    if (!firstOwned) return;
    select.value = firstOwned.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export default function WorkflowIntegrationBridge() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const catalogChanged = syncPlannerBoxesToPersonalCatalog();
        preferOwnedPackagingOptions();
        if (catalogChanged && document.querySelector('.workspace-modal.box-selector-modal')) {
          openWorkspace('boxes');
        }
      });
    };

    sync();
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, sync);
    window.addEventListener(LOCAL_OPERATOR_EVENT, sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, sync);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, sync);
    };
  }, []);

  return null;
}
