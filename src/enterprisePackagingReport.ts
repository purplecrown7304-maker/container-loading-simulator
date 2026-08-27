import * as XLSX from 'xlsx';
import type { EnterprisePackagingPlan } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';

const mm = (m: number) => Math.round(m * 1000);
const pct = (value: number) => Math.round(value * 10000) / 100;

export type EnterprisePackagingReportInput = {
  plan: EnterprisePackagingPlan;
  products: ProductItem[];
  catalog: BoxCatalogItem[];
  container: ContainerSpec;
  scenarioLabel?: string;
};

export function buildEnterprisePackagingWorkbook(input: EnterprisePackagingReportInput) {
  const { plan, products, catalog, container } = input;
  const workbook = XLSX.utils.book_new();

  const summary = [
    ['항목', '값'],
    ['전략', input.scenarioLabel ?? '현재 기업 포장 최적안'],
    ['컨테이너 내부규격(mm)', `${mm(container.length)} × ${mm(container.width)} × ${mm(container.height)}`],
    ['컨테이너 최대중량(kg)', container.maxPayloadKg],
    ['제품 종류', plan.assignments.length],
    ['총 박스 수(EA)', plan.totalBoxes],
    ['기준 박스 수(EA)', plan.baselineTotalBoxes],
    ['혼합 잔량 절감(EA)', plan.mixedCartonSavings],
    ['기준 박스 SKU(종)', plan.family.baselineBoxTypes],
    ['선정 박스 SKU(종)', plan.family.selectedBoxTypes],
    ['박스 SKU 절감(종)', plan.family.boxTypeSavings],
    ['평균 효율손실(%)', pct(plan.family.averageScoreLoss)],
    ['예상 컨테이너(대)', plan.shipment.containersRequired],
    ['전체 적재 가능', plan.shipment.fullyLoaded ? 'Y' : 'N'],
    ['정확 총 화물중량(kg)', plan.accurateTotalCargoWeightKg],
    ['총 알려진 비용', plan.cost.totalKnownCost],
    ['통화', plan.cost.currency],
    ['미가격 박스(EA)', plan.cost.unpricedCartons],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const assignmentRows = plan.assignments.map((item) => ({
    제품코드: item.productId,
    제품명: item.productName,
    박스코드: item.boxId,
    박스명: item.boxName,
    구분: item.source === 'catalog' ? '보유박스' : '자동설계',
    박스당입수_EA: item.unitsPerBox,
    필요박스_EA: item.boxesNeeded,
    외부L_mm: mm(item.outerLength),
    외부W_mm: mm(item.outerWidth),
    외부H_mm: mm(item.outerHeight),
    내부L_mm: mm(item.innerLength),
    내부W_mm: mm(item.innerWidth),
    내부H_mm: mm(item.innerHeight),
    박스총중량_kg: item.grossWeightKg,
    제품충진율_pct: pct(item.productFillRate),
    컨테이너타일효율_pct: pct(item.containerTileEfficiency),
    현재허용적층단: item.maxStackLayers,
    치수상추천적층단: item.recommendedStackLayers,
    상부허용중량_kg: item.maxTopLoadKg ?? '제한없음',
    설계요구상부하중_kg: item.requiredTopLoadKg,
    강도상태: item.strengthStatus === 'catalog' ? '카탈로그 검증값' : '제조강도 검증 필요',
    박스단가: item.boxUnitCost ?? '미입력',
    점수: item.score,
  }));
  const assignmentSheet = XLSX.utils.json_to_sheet(assignmentRows);
  assignmentSheet['!cols'] = Array.from({ length: 23 }, () => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(workbook, assignmentSheet, 'Assignments');

  const familyRows = plan.family.selectedBoxes.map((box) => ({
    박스코드: box.id,
    박스명: box.name,
    출처: box.source,
    외부L_mm: mm(box.outerLength),
    외부W_mm: mm(box.outerWidth),
    외부H_mm: mm(box.outerHeight),
    적용제품: box.assignedProducts.join(', '),
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(familyRows), 'CartonFamily');

  const mixedRows = plan.mixedCartons.map((carton) => ({
    혼합박스ID: carton.id,
    박스코드: carton.boxId,
    박스명: carton.boxName,
    외부L_mm: mm(carton.outerLength),
    외부W_mm: mm(carton.outerWidth),
    외부H_mm: mm(carton.outerHeight),
    총중량_kg: carton.grossWeightKg,
    충진율_pct: pct(carton.fillRate),
    최대적층단: carton.maxStackLayers,
    상부허용중량_kg: carton.maxTopLoadKg ?? '제한없음',
    내용물: carton.contents.map((item) => `${item.productId} ${item.quantity}EA`).join(' + '),
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mixedRows), 'MixedCartons');

  const mixedPlacementRows = plan.mixedCartons.flatMap((carton) => carton.placements.map((item) => ({
    혼합박스ID: carton.id,
    제품코드: item.productId,
    단위키: item.unitKey,
    X_mm: mm(item.x),
    Y_mm: mm(item.y),
    Z_mm: mm(item.z),
    L_mm: mm(item.length),
    W_mm: mm(item.width),
    H_mm: mm(item.height),
    회전: item.rotated ? 'Y' : 'N',
  })));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mixedPlacementRows), 'MixedPlacements');

  const cargoRows = plan.cargo.map((item) => ({
    화물코드: item.id,
    이름: item.name,
    L_mm: mm(item.length),
    W_mm: mm(item.width),
    H_mm: mm(item.height),
    중량_kg: item.weightKg,
    수량_EA: item.quantity,
    최대적층단: item.maxStackLayers ?? '',
    상부허용중량_kg: item.maxTopLoadKg ?? '제한없음',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cargoRows), 'LoadingCargo');

  const productRows = products.map((item) => ({
    제품코드: item.id,
    제품명: item.name,
    L_mm: mm(item.length), W_mm: mm(item.width), H_mm: mm(item.height),
    중량_kg: item.weightKg,
    수량_EA: item.quantity,
    박스당최대_EA: item.maxUnitsPerBox ?? '',
    방향정책: item.orientationPolicy ?? (item.allowRotation === false ? 'upright' : 'base-rotation'),
    완충여유_mm: mm(item.cushioningM ?? 0),
    내부최대적층: item.maxInternalLayers ?? '자동',
    파손주의: item.fragile ? 'Y' : 'N',
    혼합허용: item.allowMixedCarton === false ? 'N' : 'Y',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productRows), 'Products');

  const catalogRows = catalog.map((item) => ({
    박스코드: item.id,
    박스명: item.name,
    내부L_mm: mm(item.innerLength), 내부W_mm: mm(item.innerWidth), 내부H_mm: mm(item.innerHeight),
    외부L_mm: mm(item.outerLength), 외부W_mm: mm(item.outerWidth), 외부H_mm: mm(item.outerHeight),
    자중_kg: item.tareWeightKg,
    최대총중량_kg: item.maxGrossWeightKg,
    상부허용중량_kg: item.maxTopLoadKg ?? '제한없음',
    단가: item.unitCost ?? '미입력',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(catalogRows), 'BoxCatalog');

  const warnings: Array<[string, string]> = [['구분', '내용']];
  for (const item of plan.assignments.filter((assignment) => assignment.strengthStatus === 'design-target')) {
    warnings.push(['강도검증', `${item.boxId}: 자동설계 박스는 실제 BCT/ECT/원지/습도 조건 검증 전 1단 적재만 허용. 치수상 추천 ${item.recommendedStackLayers}단, 목표 상부하중 ${item.requiredTopLoadKg.toFixed(2)}kg.`]);
  }
  for (const item of plan.rejected) warnings.push(['미설계 제품', `${item.productId}: ${item.reason}`]);
  for (const item of plan.shipment.remaining) warnings.push(['컨테이너 미적재', `${item.cargoId}: ${item.quantity}EA`]);
  if (plan.cost.unpricedCartons > 0) warnings.push(['비용', `단가가 없는 박스 ${plan.cost.unpricedCartons}EA가 있어 총비용은 완전한 비용 비교값이 아닙니다.`]);
  if (warnings.length === 1) warnings.push(['상태', '추가 경고 없음']);
  const warningSheet = XLSX.utils.aoa_to_sheet(warnings);
  warningSheet['!cols'] = [{ wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, warningSheet, 'Warnings');

  return workbook;
}

export function downloadEnterprisePackagingWorkbook(input: EnterprisePackagingReportInput, filename = 'enterprise-packaging-plan.xlsx') {
  const workbook = buildEnterprisePackagingWorkbook(input);
  XLSX.writeFile(workbook, filename);
}
