import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { CargoItem } from './engine/types';
import { isLegacyAutoRecommendedPersonalBox } from './legacyBoxCleanup';
import { operatorScopedStorageKey, type LocalOperator } from './localOperator';

export const PERSONAL_BOX_CATALOG_KEY = 'container-loading-user-box-catalog-v1';
export const PERSONAL_BOX_CATALOG_EVENT = 'container-loading:personal-box-catalog-updated';
const PLANNER_KEY_PREFIX = 'container-loading-product-packaging-v1';

export type PersonalBoxCatalogItem = CargoItem & {
  catalogOrigin?: 'manual' | 'excel' | 'recommendation';
  recommendationRegistration?: 'explicit';
};

export function personalBoxCatalogKey(operator: LocalOperator) {
  return operatorScopedStorageKey(PERSONAL_BOX_CATALOG_KEY, operator);
}

function parseCatalog(raw: string | null): PersonalBoxCatalogItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as PersonalBoxCatalogItem[] : [];
  } catch {
    return [];
  }
}

/**
 * 개인 박스 목록은 사용자가 직접 등록/엑셀 업로드/추천 화면에서 명시적으로 등록한 항목만 보여준다.
 * 과거 자동 추천 기능이 몰래 넣었던 REC-* 항목은 읽는 순간 제거한다.
 */
export function readPersonalBoxCatalog(operator: LocalOperator): PersonalBoxCatalogItem[] {
  if (typeof window === 'undefined') return [];
  const key = personalBoxCatalogKey(operator);
  const parsed = parseCatalog(window.localStorage.getItem(key));
  const cleaned = parsed.filter(item => !isLegacyAutoRecommendedPersonalBox(item));
  if (cleaned.length !== parsed.length) window.localStorage.setItem(key, JSON.stringify(cleaned));
  return cleaned;
}

export function writePersonalBoxCatalog(operator: LocalOperator, items: PersonalBoxCatalogItem[]) {
  if (typeof window === 'undefined') return;
  const key = personalBoxCatalogKey(operator);
  window.localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(PERSONAL_BOX_CATALOG_EVENT, { detail: items }));
}

function markPlannerRecommendationExplicit(box: BoxCatalogItem) {
  if (typeof window === 'undefined') return;
  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key) && (key === PLANNER_KEY_PREFIX || key.startsWith(`${PLANNER_KEY_PREFIX}:`)));

  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { boxes?: Array<Record<string, unknown>> };
      if (!Array.isArray(parsed.boxes)) continue;
      let changed = false;
      const nextBoxes = parsed.boxes.map(existing => {
        if (existing.id !== box.id || existing.name !== box.name) return existing;
        changed = true;
        return { ...existing, recommendationRegistration: 'explicit' };
      });
      if (changed) window.localStorage.setItem(key, JSON.stringify({ ...parsed, boxes: nextBoxes }));
    } catch {
      // 다른 작업자/손상된 플래너 데이터는 건드리지 않는다.
    }
  }
}

/** 추천 화면의 '회사 박스로 등록' 버튼을 사용자가 직접 눌렀을 때만 개인 목록에 추가한다. */
export function registerRecommendedPersonalBox(operator: LocalOperator, box: BoxCatalogItem) {
  const current = readPersonalBoxCatalog(operator);
  const previous = current.find(item => item.id === box.id);
  const item: PersonalBoxCatalogItem = {
    id: box.id,
    name: box.name,
    length: box.outerLength,
    width: box.outerWidth,
    height: box.outerHeight,
    // 기존 박스 관리 화면의 추천 박스 표기와 호환되도록 최대 총중량을 중량 칸에 사용한다.
    weightKg: box.maxGrossWeightKg,
    quantity: 0,
    maxStackLayers: 1,
    maxTopLoadKg: box.maxTopLoadKg ?? 0,
    allowRotation: true,
    displayColor: previous?.displayColor,
    catalogOrigin: 'recommendation',
    recommendationRegistration: 'explicit',
  };
  const next = previous
    ? current.map(existing => existing.id === box.id ? item : existing)
    : [...current, item];
  writePersonalBoxCatalog(operator, next);
  // ProductToolsCenter가 같은 클릭에서 먼저 플래너에 박스를 저장하므로, 그 저장본에도 명시 등록 표식을 남긴다.
  markPlannerRecommendationExplicit(box);
  return item;
}
