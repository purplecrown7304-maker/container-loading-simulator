import * as XLSX from 'xlsx';
import type { EnterprisePackagingPlan } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';

const mm = (value: number) => Math.round(value * 1000);
const pct = (value: number) => Number((value * 100).toFixed(2));

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Array<Record<string, string | number | boolean>>) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    sheet['!cols'] = keys.map((key) => ({ wch: Math.min(36, Math.max(12, key.length + 4)) }));
  }
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export function downloadEnterprisePackagingWorkbook(
  plan: EnterprisePackagingPlan,
  container: ContainerSpec,
  products: ProductItem[],
  boxes: BoxCatalogItem[],
) {
  const workbook = XLSX.utils.book_new();
  const productById = new Map(products.map((item) => [item.id, item]));

  addSheet(workbook, 'Summary', [{
    '컨테이너 L(mm)': mm(container.length),
    '컨테이너 W(mm)': mm(container.width),
    '컨테이너 H(mm)': mm(container.height),
    '최대 적재중량(kg)': container.maxPayloadKg,
    '제품종수': plan.assignments.length,
    '기존 박스수(EA)': plan.baselineTotalBoxes,
    '최종 박스수(EA)': plan.totalBoxes,
    '혼합 잔량 절감(EA)': plan.mixedCartonSavings,
    '기존 박스 규격수': plan.family.baselineBoxTypes,
    '최종 박스 규격수': plan.family.selectedBoxTypes,
    '박스 규격 절감수': plan.family.boxTypeSavings,
    '예상 컨테이너수': plan.shipment.containersRequired,
    '전량 적재 가능': plan.shipment.fullyLoaded,
    '정확 총 화물중량(kg)': Number(plan.accurateTotalCargoWeightKg.toFixed(3)),
    '비용 통화': plan.cost.currency,
    '확인 가능 총비용': Number(plan.cost.totalKnownCost.toFixed(2)),
    '미가격 박스(EA)': plan.cost.unpricedCartons,
  }]);

  addSheet(workbook, 'ProductAssignments', plan.assignments.map((item) => {
    const product = productById.get(item.productId);
    return {
      '제품코드': item.productId,
      '제품명': item.productName,
      '제품 L(mm)': product ? mm(product.length) : '',
      '제품 W(mm)': product ? mm(product.width) : '',
      '제품 H(mm)': product ? mm(product.height) : '',
      '제품중량(kg)': product?.weightKg ?? '',
      '출하수량(EA)': product?.quantity ?? '',
      '회전정책': product?.orientationPolicy ?? (product?.allowRotation === false ? 'upright' : 'base-rotation'),
      '완충여유(mm)': product ? mm(product.cushioningM ?? 0) : '',
      '파손주의': product?.fragile === true,
      '잔량 혼합허용': product?.allowMixedCarton !== false,
      '선정박스코드': item.boxId,
      '선정박스명': item.boxName,
      '박스소스': item.source === 'catalog' ? '보유박스' : '자동/공용설계',
      '외부 L(mm)': mm(item.outerLength),
      '외부 W(mm)': mm(item.outerWidth),
      '외부 H(mm)': mm(item.outerHeight),
      '내부 L(mm)': mm(item.innerLength),
      '내부 W(mm)': mm(item.innerWidth),
      '내부 H(mm)': mm(item.innerHeight),
      '입수(EA/박스)': item.unitsPerBox,
      '필요박스(EA)': item.boxesNeeded,
      'Full 박스중량(kg)': Number(item.grossWeightKg.toFixed(3)),
      '제품충진율(%)': pct(item.productFillRate),
      '컨테이너 타일효율(%)': pct(item.containerTileEfficiency),
      '추천 적층단': item.recommendedStackLayers,
      '실적용 적층단': item.maxStackLayers,
      '상부허용중량(kg)': item.maxTopLoadKg ?? '',
      '설계요구 상부하중(kg)': Number(item.requiredTopLoadKg.toFixed(2)),
      '강도상태': item.strengthStatus === 'catalog' ? '카탈로그 검증값 사용' : '미검증 설계목표',
      '박스단가': item.boxUnitCost ?? '',
    };
  }));

  addSheet(workbook, 'CartonFamily', plan.family.selectedBoxes.map((item) => ({
    '박스코드': item.id,
    '박스명': item.name,
    '소스': item.source === 'catalog' ? '보유박스' : '자동/공용설계',
    '외부 L(mm)': mm(item.outerLength),
    '외부 W(mm)': mm(item.outerWidth),
    '외부 H(mm)': mm(item.outerHeight),
    '적용제품': item.assignedProducts.join(', '),
  })));

  addSheet(workbook, 'MixedCartons', plan.mixedCartons.map((item) => ({
    '혼합박스ID': item.id,
    '박스코드': item.boxId,
    '박스명': item.boxName,
    '소스': item.source === 'catalog' ? '보유박스' : '자동/공용설계',
    '외부 L(mm)': mm(item.outerLength),
    '외부 W(mm)': mm(item.outerWidth),
    '외부 H(mm)': mm(item.outerHeight),
    '총중량(kg)': Number(item.grossWeightKg.toFixed(3)),
    '충진율(%)': pct(item.fillRate),
    '최대적층단': item.maxStackLayers,
    '상부허용중량(kg)': item.maxTopLoadKg ?? '',
    '내용물': item.contents.map((content) => `${content.productId} ${content.quantity}EA`).join(' + '),
  })));

  addSheet(workbook, 'MixedContents', plan.mixedCartons.flatMap((carton) => carton.contents.map((content) => ({
    '혼합박스ID': carton.id,
    '제품코드': content.productId,
    '제품명': content.productName,
    '수량(EA)': content.quantity,
  }))));

  addSheet(workbook, 'MixedPlacements', plan.mixedCartons.flatMap((carton) => carton.placements.map((placement) => ({
    '혼합박스ID': carton.id,
    '제품코드': placement.productId,
    '제품단위키': placement.unitKey,
    'X(mm)': mm(placement.x),
    'Y(mm)': mm(placement.y),
    'Z(mm)': mm(placement.z),
    'L(mm)': mm(placement.length),
    'W(mm)': mm(placement.width),
    'H(mm)': mm(placement.height),
    '회전': placement.rotated,
  }))));

  addSheet(workbook, 'PartialCartons', plan.dedicatedPartialCartons.map((item) => ({
    '제품코드': item.productId,
    '잔량수량(EA)': item.quantity,
    '실제박스중량(kg)': Number(item.grossWeightKg.toFixed(3)),
    '화물ID': item.cargoId,
  })));

  addSheet(workbook, 'FinalCargo', plan.cargo.map((item) => ({
    '화물ID': item.id,
    '화물명': item.name,
    'L(mm)': mm(item.length),
    'W(mm)': mm(item.width),
    'H(mm)': mm(item.height),
    '중량(kg/박스)': Number(item.weightKg.toFixed(3)),
    '수량(EA)': item.quantity,
    '최대적층단': item.maxStackLayers ?? '',
    '상부허용중량(kg)': item.maxTopLoadKg ?? '',
  })));

  addSheet(workbook, 'Cost', [{
    '통화': plan.cost.currency,
    '확인박스비': Number(plan.cost.knownCartonCost.toFixed(2)),
    '포장작업비': Number(plan.cost.handlingCost.toFixed(2)),
    '신규규격셋업비': Number(plan.cost.setupCost.toFixed(2)),
    '박스SKU관리비': Number(plan.cost.cartonSkuCost.toFixed(2)),
    '컨테이너운임': Number(plan.cost.freightCost.toFixed(2)),
    '확인가능총비용': Number(plan.cost.totalKnownCost.toFixed(2)),
    '미가격박스(EA)': plan.cost.unpricedCartons,
  }]);

  addSheet(workbook, 'BoxCatalog', boxes.map((item) => ({
    '박스코드': item.id,
    '박스명': item.name,
    '내부 L(mm)': mm(item.innerLength),
    '내부 W(mm)': mm(item.innerWidth),
    '내부 H(mm)': mm(item.innerHeight),
    '외부 L(mm)': mm(item.outerLength),
    '외부 W(mm)': mm(item.outerWidth),
    '외부 H(mm)': mm(item.outerHeight),
    '자중(kg)': item.tareWeightKg,
    '최대총중량(kg)': item.maxGrossWeightKg,
    '상부허용중량(kg)': item.maxTopLoadKg ?? '',
    '단가': item.unitCost ?? '',
  })));

  XLSX.writeFile(workbook, `enterprise-packaging-plan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
