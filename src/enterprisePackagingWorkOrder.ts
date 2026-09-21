import { buildReportDocument, reportTable, REPORT_SIGNOFF } from './reportLayout';
import type { EnterprisePackagingPlan } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const mm = (value: number) => Math.round(value * 1000);
const kg = (value: number) => Number.isFinite(value) ? value.toFixed(2) : '-';

function productHandling(product: ProductItem | undefined) {
  if (!product) return '-';
  const orientation = product.orientationPolicy === 'upright'
    ? '세워서만'
    : product.orientationPolicy === 'any'
      ? '3축 회전 허용'
      : '바닥면 90° 회전';
  return [
    orientation,
    product.cushioningM ? `완충 ${Math.round(product.cushioningM * 1000)}mm` : null,
    product.maxInternalLayers ? `내부 ${product.maxInternalLayers}단 이하` : null,
    product.fragile ? '파손주의' : null,
    product.allowMixedCarton === false ? '혼합금지' : null,
  ].filter(Boolean).join(' · ');
}

export function buildEnterprisePackagingWorkOrderHtml(
  plan: EnterprisePackagingPlan,
  container: ContainerSpec,
  products: ProductItem[],
  _boxes: BoxCatalogItem[],
) {
  const productsById = new Map(products.map((item) => [item.id, item]));
  const partialByProduct = new Map(plan.dedicatedPartialCartons.map((item) => [item.productId, item]));
  const unverified = plan.assignments.filter((item) => item.strengthStatus === 'design-target');
  const assignmentRows = plan.assignments.map((item) => {
    const product = productsById.get(item.productId);
    const fullCount = Math.floor((product?.quantity ?? 0) / Math.max(1, item.unitsPerBox));
    const partial = partialByProduct.get(item.productId);
    return `<tr>
      <td><b>${esc(item.productId)}</b><small>${esc(item.productName)}</small></td>
      <td><b>${esc(item.boxId)}</b><small>${esc(item.boxName)}</small><small>${mm(item.outerLength)}×${mm(item.outerWidth)}×${mm(item.outerHeight)} mm</small></td>
      <td><b>${fullCount} BOX</b><small>${item.unitsPerBox} EA / BOX</small><small>${kg(item.grossWeightKg)} kg / BOX</small></td>
      <td>${partial ? `${partial.quantity}EA / ${kg(partial.grossWeightKg)}kg` : '-'}</td>
      <td><b>${item.maxStackLayers}단${item.strengthStatus === 'design-target' ? ' · 강도 확인 필요' : ''}</b><small>${esc(productHandling(product))}</small></td>
      <td class="check">□</td>
    </tr>`;
  }).join('');

  const mixedRows = plan.mixedCartons.map((carton) => `<section class="mixed-card">
    <h3>${esc(carton.id)} · ${esc(carton.boxId)}</h3>
    <p class="legend">${mm(carton.outerLength)}×${mm(carton.outerWidth)}×${mm(carton.outerHeight)} mm · ${kg(carton.grossWeightKg)} kg</p>
    <p><b>내용:</b> ${carton.contents.map((item) => `${esc(item.productId)} ${item.quantity}EA`).join(' + ')}</p>
    ${reportTable(`${carton.id} 내부 배치표`, `<table><thead><tr><th scope="col">제품</th><th scope="col">개별 번호</th><th scope="col">X (mm)</th><th scope="col">Y (mm)</th><th scope="col">Z (mm)</th><th scope="col">L×W×H (mm)</th></tr></thead><tbody>
      ${carton.placements.map((item) => `<tr><td>${esc(item.productId)}</td><td>${esc(item.unitKey)}</td><td>${mm(item.x)}</td><td>${mm(item.y)}</td><td>${mm(item.z)}</td><td>${mm(item.length)}×${mm(item.width)}×${mm(item.height)}</td></tr>`).join('')}
    </tbody></table>`)}
  </section>`).join('');

  const selectedBoxRows = plan.family.selectedBoxes.map((box) => `<tr><td>${esc(box.id)}</td><td>${esc(box.name)}</td><td>${esc(box.source)}</td><td>${mm(box.outerLength)}×${mm(box.outerWidth)}×${mm(box.outerHeight)} mm</td><td>${box.assignedProducts.map(esc).join(', ')}</td></tr>`).join('');

  return buildReportDocument({
    title: '기업 포장 작업지시서',
    subtitle: `${new Date().toLocaleString('ko-KR')} · 컨테이너 ${mm(container.length)} × ${mm(container.width)} × ${mm(container.height)} mm · 최대중량 ${container.maxPayloadKg.toLocaleString()} kg`,
    status: unverified.length ? `강도 미검증 자동규격 ${unverified.length}종` : '포장 계획 · 출하 검증 별도',
    tone: unverified.length ? 'caution' : 'neutral',
    summary: `<section class="summary" aria-label="포장 작업 요약"><div><span>제품 / 박스 규격</span><b>${plan.assignments.length}종 / ${plan.family.selectedBoxTypes}종</b></div><div><span>포장박스</span><b>${plan.totalBoxes} EA</b></div><div><span>혼합박스</span><b>${plan.mixedCartons.length} EA</b></div><div><span>예상 컨테이너</span><b>${plan.shipment.containersRequired}대</b></div></section>`,
    sections: [
      { title: '제품별 포장 지시', description: '정량 박스와 전용 잔량을 구분해 포장하고 취급 조건을 확인하세요.',
        content: `${unverified.length ? `<p class="notice"><b>강도 미검증 자동규격 ${unverified.length}종</b><br>강도 확인 필요로 표시된 규격은 제조 강도 승인 전 실제 적층 작업에 사용하지 마세요. 시스템 적용값은 1단 / 상부허용 0kg입니다.</p>` : ''}${reportTable('제품별 포장 지시 표', `<table><colgroup><col style="width:19%"><col style="width:23%"><col style="width:17%"><col style="width:15%"><col style="width:19%"><col style="width:7%"></colgroup><thead><tr><th scope="col">제품</th><th scope="col">박스 / 외경</th><th scope="col">정량 포장</th><th scope="col">전용 잔량</th><th scope="col">적층 / 취급 조건</th><th scope="col">확인</th></tr></thead><tbody>${assignmentRows}</tbody></table>`)}` },
      { title: '준비할 박스 규격', description: '운영 박스 패밀리의 규격과 적용 제품을 대조하세요.',
        content: reportTable('운영 박스 패밀리', `<table><thead><tr><th scope="col">박스 코드</th><th scope="col">박스명</th><th scope="col">종류</th><th scope="col">외경</th><th scope="col">적용 제품</th></tr></thead><tbody>${selectedBoxRows}</tbody></table>`) },
      { title: '혼합 잔량 박스 내부 배치', description: '박스별 내용물과 내부 배치 좌표를 확인하세요. 모든 좌표와 규격의 단위는 mm입니다.',
        content: mixedRows || '<p class="empty-state">혼합 잔량 박스가 없습니다.</p>' },
      { title: '비용 및 운송 요약', description: '가격이 없는 박스는 별도로 확인하세요. 예상 컨테이너 수는 포장 계획 기준입니다.',
        content: reportTable('비용 및 운송 요약 표', `<table><tbody><tr><th scope="row">확인 가능한 박스비</th><td>${plan.cost.knownCartonCost.toLocaleString()} ${esc(plan.cost.currency)}</td><th scope="row">미가격 박스</th><td>${plan.cost.unpricedCartons} EA</td></tr><tr><th scope="row">작업비</th><td>${plan.cost.handlingCost.toLocaleString()}</td><th scope="row">신규규격 셋업</th><td>${plan.cost.setupCost.toLocaleString()}</td></tr><tr><th scope="row">SKU 관리비</th><td>${plan.cost.cartonSkuCost.toLocaleString()}</td><th scope="row">컨테이너 운임</th><td>${plan.cost.freightCost.toLocaleString()}</td></tr></tbody></table>`) },
      { title: '포장 완료 확인', description: '실물 수량과 포장 상태를 대조한 뒤 담당자가 확인하세요.',
        content: `<ul class="checklist"><li>정량 박스와 잔량 박스의 제품 수량을 대조</li><li>회전·완충·파손주의·혼합금지 조건을 확인</li><li>미검증 규격의 제조 강도를 확인하고 별도 최종 적재 검증 진행</li></ul>${REPORT_SIGNOFF}<p class="technical-note">본 문서는 포장 작업 계획용입니다. 자동설계 박스의 실제 압축강도, 원지/골종, 습도 영향, 테이핑 방식은 제조사 또는 포장 엔지니어 검증이 필요합니다. 컨테이너 최종 작업지시서는 별도 관성 PASS 후 생성합니다.</p>` },
    ],
    footer: `<span>기업 포장 작업 계획</span><span>제품 ${plan.assignments.length}종 · 포장박스 ${plan.totalBoxes} EA</span>`,
  });
}

export function openEnterprisePackagingWorkOrder(
  plan: EnterprisePackagingPlan,
  container: ContainerSpec,
  products: ProductItem[],
  boxes: BoxCatalogItem[],
) {
  if (typeof window === 'undefined') return false;
  // 일부 브라우저는 features에 noopener를 직접 주면 WindowProxy를 null로 반환한다.
  // 먼저 핸들을 확보한 뒤 opener 참조를 끊어 팝업 차단과 보안 처리를 구분한다.
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* cross-window restriction */ }
  popup.document.open();
  popup.document.write(buildEnterprisePackagingWorkOrderHtml(plan, container, products, boxes));
  popup.document.close();
  return true;
}
