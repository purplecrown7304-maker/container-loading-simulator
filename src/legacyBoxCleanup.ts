import type { CargoItem } from './engine/types';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';

const LEGACY_CATALOG_KEY = 'container-loading-box-catalog-v1';
const USER_CATALOG_KEY = 'container-loading-user-box-catalog-v1';
const PLANNER_KEY = 'container-loading-product-packaging-v1';
const EPS = 1e-9;

function closeEnough(a: unknown, b: number) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= EPS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

/**
 * 2026-08 초기 박스 선택 화면이 자동으로 만들던 18개 가상 화물.
 * ID만 보고 삭제하지 않고 이름/규격/중량/적층 조건까지 맞는 경우에만 제거한다.
 * 사용자가 같은 BOX-001 코드를 실제 박스에 사용해도 삭제되지 않는다.
 */
export function isLegacySyntheticCatalogBox(value: unknown): boolean {
  const item = asRecord(value);
  if (!item) return false;
  const id = typeof item.id === 'string' ? item.id : '';
  const match = /^BOX-(\d{3})$/.exec(id);
  if (!match) return false;
  const number = Number(match[1]);
  if (number < 1 || number > 18) return false;

  const index = number - 1;
  const lengths = [0.4, 0.5, 0.6, 0.7, 0.8];
  const widths = [0.3, 0.38, 0.46, 0.54];
  const heights = [0.25, 0.32, 0.39, 0.46, 0.53, 0.6];
  const expectedName = `가상 화물 ${String(number).padStart(2, '0')}`;

  return item.name === expectedName
    && closeEnough(item.length, lengths[index % lengths.length])
    && closeEnough(item.width, widths[index % widths.length])
    && closeEnough(item.height, heights[index % heights.length])
    && closeEnough(item.weightKg, 8 + index * 4)
    && item.maxStackLayers === 3 + (index % 5)
    && closeEnough(item.maxTopLoadKg, 24 + index * 24)
    && item.allowRotation === (index % 6 !== 5);
}

/**
 * 범용 추천은 추천 결과일 뿐 개인 박스가 아니다.
 * 개인 목록에는 추천 화면에서 사용자가 직접 '회사 박스로 등록'을 눌러
 * recommendationRegistration='explicit' 표식이 붙은 항목만 남긴다.
 * 이 규칙 덕분에 과거 버전이 자동 저장한 REC-* 항목은 필드 버전 차이와 무관하게 정리된다.
 */
export function isLegacyAutoRecommendedPersonalBox(value: unknown): boolean {
  const item = asRecord(value);
  if (!item) return false;
  if (item.recommendationRegistration === 'explicit') return false;

  const id = typeof item.id === 'string' ? item.id : '';
  const name = typeof item.name === 'string' ? item.name : '';
  const idMatch = /^REC-(\d+)X(\d+)X(\d+)(?:-\d+)?$/.exec(id);
  const nameMatch = /^(?:범용 추천|추가추천) (\d+)×(\d+)×(\d+) \(강도확인\)$/.exec(name);
  if (!idMatch || !nameMatch) return false;

  const dimensionsMm = idMatch.slice(1, 4).map(Number);
  const nameDimensionsMm = nameMatch.slice(1).map(Number);
  return dimensionsMm.every((dimension, index) => Number.isFinite(dimension)
    && dimension > 0
    && dimension === nameDimensionsMm[index]);
}

const LEGACY_SAMPLE_BOXES: Array<{
  id: string;
  name: string;
  inner: [number, number, number];
  outer: [number, number, number];
  tareWeightKg: number;
  maxGrossWeightKg: number;
  maxTopLoadKg: number;
}> = [
  {
    id: 'BOX-604040',
    name: '600×400×400',
    inner: [0.59, 0.39, 0.39],
    outer: [0.6, 0.4, 0.4],
    tareWeightKg: 0.8,
    maxGrossWeightKg: 22,
    maxTopLoadKg: 80,
  },
  {
    id: 'BOX-503030',
    name: '500×300×300',
    inner: [0.49, 0.29, 0.29],
    outer: [0.5, 0.3, 0.3],
    tareWeightKg: 0.6,
    maxGrossWeightKg: 18,
    maxTopLoadKg: 60,
  },
];

/** 기업 포장 플래너의 예전 "샘플 불러오기"가 저장하던 샘플 박스만 판별한다. */
export function isLegacyPlannerSampleBox(value: unknown): boolean {
  const item = asRecord(value);
  if (!item) return false;
  const spec = LEGACY_SAMPLE_BOXES.find(candidate => candidate.id === item.id && candidate.name === item.name);
  if (!spec) return false;
  return closeEnough(item.innerLength, spec.inner[0])
    && closeEnough(item.innerWidth, spec.inner[1])
    && closeEnough(item.innerHeight, spec.inner[2])
    && closeEnough(item.outerLength, spec.outer[0])
    && closeEnough(item.outerWidth, spec.outer[1])
    && closeEnough(item.outerHeight, spec.outer[2])
    && closeEnough(item.tareWeightKg, spec.tareWeightKg)
    && closeEnough(item.maxGrossWeightKg, spec.maxGrossWeightKg)
    && closeEnough(item.maxTopLoadKg, spec.maxTopLoadKg);
}

function isLegacyUnregisteredCatalogBox(value: unknown): boolean {
  return isLegacySyntheticCatalogBox(value) || isLegacyAutoRecommendedPersonalBox(value);
}

export function removeLegacySyntheticCargoBoxes(items: CargoItem[]): CargoItem[] {
  return items.filter(item => !isLegacyUnregisteredCatalogBox(item));
}

export function removeLegacyPlannerSampleBoxes(items: BoxCatalogItem[]): BoxCatalogItem[] {
  return items.filter(item => !isLegacyPlannerSampleBox(item));
}

function cleanCatalogStorage(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    const cleaned = parsed.filter(item => !isLegacyUnregisteredCatalogBox(item));
    if (cleaned.length !== parsed.length) window.localStorage.setItem(key, JSON.stringify(cleaned));
  } catch {
    // 손상된 저장값은 여기서 임의 삭제하지 않는다.
  }
}

function cleanPlannerStorage(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || !Array.isArray(parsed.boxes)) return;
    // 추천 분석 결과 자체는 보유 박스가 아니다. 사용자가 등록 버튼을 눌러 explicit 표식이 붙은 추천만 보유 박스로 유지한다.
    const cleanedBoxes = parsed.boxes.filter(item => !isLegacyPlannerSampleBox(item) && !isLegacyAutoRecommendedPersonalBox(item));
    if (cleanedBoxes.length !== parsed.boxes.length) {
      window.localStorage.setItem(key, JSON.stringify({ ...parsed, boxes: cleanedBoxes }));
    }
  } catch {
    // 손상된 저장값은 여기서 임의 삭제하지 않는다.
  }
}

/**
 * 앱 시작 시 예전 버전이 사용자의 의사와 무관하게 넣었던 박스만 제거한다.
 * 현재 사용자가 직접 등록/엑셀 업로드하거나 추천 화면에서 명시적으로 등록한 박스는 건드리지 않는다.
 */
export function cleanupLegacyUnregisteredBoxes() {
  if (typeof window === 'undefined') return;
  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key));

  for (const key of keys) {
    if (key === LEGACY_CATALOG_KEY || key === USER_CATALOG_KEY || key.startsWith(`${USER_CATALOG_KEY}:`)) {
      cleanCatalogStorage(key);
    }
    if (key === PLANNER_KEY || key.startsWith(`${PLANNER_KEY}:`)) {
      cleanPlannerStorage(key);
    }
  }
}
