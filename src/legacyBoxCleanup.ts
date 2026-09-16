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
 * 예전 범용 박스 추천 기능이 추천 결과를 개인 박스 목록에 자동 저장하던 항목.
 * REC 코드만으로 지우지 않고 자동생성 이름, 규격, 기본 안전값까지 모두 맞을 때만 제거한다.
 * 따라서 사용자가 REC 코드를 실제 박스 코드로 재사용한 경우에는 보존된다.
 */
export function isLegacyAutoRecommendedPersonalBox(value: unknown): boolean {
  const item = asRecord(value);
  if (!item) return false;

  const id = typeof item.id === 'string' ? item.id : '';
  const name = typeof item.name === 'string' ? item.name : '';
  const idMatch = /^REC-(\d+)X(\d+)X(\d+)$/.exec(id);
  const nameMatch = /^범용 추천 (\d+)×(\d+)×(\d+) \(강도확인\)$/.exec(name);
  if (!idMatch || !nameMatch) return false;

  const dimensionsMm = idMatch.slice(1).map(Number);
  const nameDimensionsMm = nameMatch.slice(1).map(Number);
  if (dimensionsMm.some((dimension, index) => dimension !== nameDimensionsMm[index])) return false;
  if (dimensionsMm.some(dimension => !Number.isFinite(dimension) || dimension <= 0)) return false;

  const [lengthMm, widthMm, heightMm] = dimensionsMm;
  return closeEnough(item.length, lengthMm / 1000)
    && closeEnough(item.width, widthMm / 1000)
    && closeEnough(item.height, heightMm / 1000)
    && closeEnough(item.weightKg, 22)
    && item.quantity === 0
    && item.maxStackLayers === 1
    && closeEnough(item.maxTopLoadKg, 0)
    && item.allowRotation === true;
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
    const cleanedBoxes = parsed.boxes.filter(item => !isLegacyPlannerSampleBox(item));
    if (cleanedBoxes.length !== parsed.boxes.length) {
      window.localStorage.setItem(key, JSON.stringify({ ...parsed, boxes: cleanedBoxes }));
    }
  } catch {
    // 손상된 저장값은 여기서 임의 삭제하지 않는다.
  }
}

/**
 * 앱 시작 시 예전 버전이 사용자의 의사와 무관하게 넣었던 박스만 제거한다.
 * 현재 사용자가 직접 등록/엑셀 업로드한 박스는 건드리지 않는다.
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
