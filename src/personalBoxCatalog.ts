import { isAdminSession } from './adminAccess';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { CargoItem } from './engine/types';
import { isLegacyAutoRecommendedPersonalBox } from './legacyBoxCleanup';
import { operatorScopedStorageKey, type LocalOperator } from './localOperator';

export const PERSONAL_BOX_CATALOG_KEY = 'container-loading-user-box-catalog-v1';
export const PERSONAL_BOX_CATALOG_EVENT = 'container-loading:personal-box-catalog-updated';
const PLANNER_KEY_PREFIX = 'container-loading-product-packaging-v1';
const PLANNER_EVENT = 'container-loading:enterprise-packaging-planner-updated';

export type PersonalBoxCatalogItem = CargoItem & {
  catalogOrigin?: 'manual' | 'excel' | 'recommendation';
  recommendationRegistration?: 'explicit';
};

type ExplicitPlannerBox = BoxCatalogItem & { recommendationRegistration: 'explicit' };

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

function activePlannerKey(operator: LocalOperator) {
  return isAdminSession()
    ? `${PLANNER_KEY_PREFIX}:admin`
    : operatorScopedStorageKey(PLANNER_KEY_PREFIX, operator);
}

function upsertExplicitPlannerRecommendation(operator: LocalOperator, box: BoxCatalogItem) {
  if (typeof window === 'undefined') return;
  const key = activePlannerKey(operator);
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { boxes?: BoxCatalogItem[] } & Record<string, unknown>;
    if (!Array.isArray(parsed.boxes)) return;
    const registered: ExplicitPlannerBox = { ...box, recommendationRegistration: 'explicit' };
    const exists = parsed.boxes.some(existing => existing.id === box.id);
    const boxes = exists
      ? parsed.boxes.map(existing => existing.id === box.id ? registered : existing)
      : [...parsed.boxes, registered];
    const next = { ...parsed, boxes };
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PLANNER_EVENT, { detail: next }));
  } catch {
    // 플래너 저장값이 손상된 경우 개인 박스 등록 자체는 유지한다.
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
  upsertExplicitPlannerRecommendation(operator, box);
  return item;
}
