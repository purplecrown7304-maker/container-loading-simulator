import { beforeEach, describe, expect, it } from 'vitest';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import { loginLocalOperator, operatorScopedStorageKey } from './localOperator';
import { PERSONAL_BOX_CATALOG_KEY, readPersonalBoxCatalog, registerRecommendedPersonalBox, removeExplicitPlannerRecommendation, restoreExplicitPlannerRecommendation, writePersonalBoxCatalog } from './personalBoxCatalog';
import { loadContainer } from './engine/loadingEngine';
import { declaredStackCap } from './engine/stackLimitReason';
import type { CargoItem, ContainerSpec } from './engine/types';

const plannerKey = 'container-loading-product-packaging-v1';
// The box from the 2026-10-08 report: registered from a recommendation, then missing from the personal list.
const reported = { id: 'REC-235X310X265', name: '범용 추천 235×310×265 (강도확인)', innerLength: .227, innerWidth: .302, innerHeight: .257,
  outerLength: .235, outerWidth: .31, outerHeight: .265, tareWeightKg: .6, maxGrossWeightKg: 22, maxTopLoadKg: 0, maxStackLayers: 1,
  recommendationRegistration: 'explicit' } as BoxCatalogItem & { recommendationRegistration: 'explicit' };
const verified = { ...reported, id: 'REC-235X130X265', name: '범용 추천 235×130×265 (강도확인)', outerWidth: .13, innerWidth: .122, maxTopLoadKg: 100, maxStackLayers: 10 };
const manualOnlyPlannerBox: BoxCatalogItem = { ...reported, id: 'PLANNER-ONLY', name: '플래너 직접 등록', recommendationRegistration: undefined } as BoxCatalogItem;

function seed(operatorName: string) {
  const operator = loginLocalOperator(operatorName)!;
  localStorage.setItem(operatorScopedStorageKey(plannerKey, operator), JSON.stringify({ container: { length: 12, width: 2.35, height: 2.7, maxPayloadKg: 28000 }, products: [], boxes: [verified, reported, manualOnlyPlannerBox] }));
  writePersonalBoxCatalog(operator, [{ id: verified.id, name: verified.name, length: .235, width: .13, height: .265, weightKg: 22, quantity: 0, maxStackLayers: 10, maxTopLoadKg: 100, topLoadLimitExplicit: true, catalogOrigin: 'recommendation', recommendationRegistration: 'explicit' }]);
  return operator;
}
const planner = (operator: ReturnType<typeof seed>) => JSON.parse(localStorage.getItem(operatorScopedStorageKey(plannerKey, operator))!).boxes as BoxCatalogItem[];

describe('registered recommendation missing from the personal list (2026-10-08 report)', () => {
  beforeEach(() => localStorage.clear());

  it('lists it again in box management as strength-unverified, without inventing strength', () => {
    const operator = seed('누락박스사용자');
    const list = readPersonalBoxCatalog(operator);
    const restored = list.find(item => item.id === reported.id);
    expect(restored).toMatchObject({ length: .235, width: .31, height: .265, maxStackLayers: 1, maxTopLoadKg: 0, strengthUnverified: true, catalogOrigin: 'recommendation' });
    // Persisted, so every screen reading the list sees the same entry.
    expect(JSON.parse(localStorage.getItem(operatorScopedStorageKey(PERSONAL_BOX_CATALOG_KEY, operator))!).map((item: { id: string }) => item.id)).toEqual([verified.id, reported.id]);
    // Existing entries keep their values; planner boxes that were never personal registrations stay out.
    expect(list.find(item => item.id === verified.id)).toMatchObject({ maxStackLayers: 10, maxTopLoadKg: 100 });
    expect(list.some(item => item.id === 'PLANNER-ONLY')).toBe(false);
    expect(readPersonalBoxCatalog(operator)).toHaveLength(2);
  });

  it('keeps a restored box editable: values entered in box management reach the planner copy', () => {
    const operator = seed('수정사용자');
    const list = readPersonalBoxCatalog(operator);
    writePersonalBoxCatalog(operator, list.map(item => item.id === reported.id ? { ...item, maxStackLayers: 10, maxTopLoadKg: 80, topLoadLimitExplicit: true, strengthUnverified: false } : item));
    registerRecommendedPersonalBox(operator, reported); // re-registration must preserve the edited limits
    expect(planner(operator).find(box => box.id === reported.id)).toMatchObject({ maxStackLayers: 10, maxTopLoadKg: 80, strengthUnverified: false });
  });

  it('removes the planner copy on delete so it cannot come back, and restores it on undo', () => {
    const operator = seed('삭제사용자');
    readPersonalBoxCatalog(operator);
    const removed = removeExplicitPlannerRecommendation(operator, reported.id);
    expect(removed?.id).toBe(reported.id);
    expect(planner(operator).map(box => box.id)).toEqual([verified.id, 'PLANNER-ONLY']);
    writePersonalBoxCatalog(operator, readPersonalBoxCatalog(operator).filter(item => item.id !== reported.id));
    expect(readPersonalBoxCatalog(operator).some(item => item.id === reported.id)).toBe(false);
    restoreExplicitPlannerRecommendation(operator, removed!);
    expect(planner(operator).some(box => box.id === reported.id)).toBe(true);
    // Never touches planner boxes that were not personal registrations.
    expect(removeExplicitPlannerRecommendation(operator, 'PLANNER-ONLY')).toBeUndefined();
  });
});

describe('waiting cargo blocked by its own stacking data names the cause', () => {
  const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, ceilingClearanceM: 0.05 };
  const carton: CargoItem = { id: 'PKG-GST-001', name: 'GST-001', length: .235, width: .31, height: .265, weightKg: 6.9, quantity: 476, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true };

  it('reports the reported load as a one-layer limit instead of missing space', () => {
    const result = loadContainer(container, [carton], { publish: false });
    const row = result.remaining.find(item => item.cargoId === carton.id)!;
    expect(result.placements.every(p => p.z === 0)).toBe(true);
    expect(row.reasonCode).toBe('STACK_LIMIT');
    expect(row.reason).toContain('적층 1단 제한');
    expect(row.reason).toContain('높이로는 10단까지 가능');
  });

  it('names an unverified box and keeps the space reason when stacking is not the limit', () => {
    expect(declaredStackCap({ ...carton, strengthUnverified: true })?.source).toContain('박스 강도 미확인');
    expect(declaredStackCap({ ...carton, maxStackLayers: undefined, maxTopLoadKg: 13.8 })).toEqual({ layers: 3, source: '상부 허용하중 13.8 kg' });
    const stackable = { ...carton, maxStackLayers: 10, maxTopLoadKg: 100, quantity: 4000 };
    const result = loadContainer(container, [stackable], { publish: false });
    const row = result.remaining.find(item => item.cargoId === carton.id);
    expect(row?.reasonCode).not.toBe('STACK_LIMIT');
  });
});
