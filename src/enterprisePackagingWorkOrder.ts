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
      <td><b>${esc(item.boxId)}</b><small>${esc(item.boxName)}</small></td>
      <td>${mm(item.outerLength)}×${mm(item.outerWidth)}×${mm(item.outerHeight)} mm</td>
      <td>${item.unitsPerBox} EA</td>
      <td>${fullCount} BOX</td>
      <td>${partial ? `${partial.quantity}EA / ${kg(partial.grossWeightKg)}kg` : '-'}</td>
      <td>${kg(item.grossWeightKg)} kg</td>
      <td>${item.maxStackLayers}단${item.strengthStatus === 'design-target' ? ' ⚠' : ''}</td>
      <td>${esc(productHandling(product))}</td>
    </tr>`;
  }).join('');

  const mixedRows = plan.mixedCartons.map((carton) => `<section class="mixed-card">
    <h3>${esc(carton.id)} · ${esc(carton.boxId)} <span>${mm(carton.outerLength)}×${mm(carton.outerWidth)}×${mm(carton.outerHeight)}mm · ${kg(carton.grossWeightKg)}kg</span></h3>
    <p><b>내용:</b> ${carton.contents.map((item) => `${esc(item.productId)} ${item.quantity}EA`).join(' + ')}</p>
    <table><thead><tr><th>제품</th><th>Unit</th><th>X</th><th>Y</th><th>Z</th><th>L×W×H</th></tr></thead><tbody>
      ${carton.placements.map((item) => `<tr><td>${esc(item.productId)}</td><td>${esc(item.unitKey)}</td><td>${mm(item.x)}</td><td>${mm(item.y)}</td><td>${mm(item.z)}</td><td>${mm(item.length)}×${mm(item.width)}×${mm(item.height)}</td></tr>`).join('')}
    </tbody></table>
  </section>`).join('');

  const selectedBoxRows = plan.family.selectedBoxes.map((box) => `<tr><td>${esc(box.id)}</td><td>${esc(box.name)}</td><td>${esc(box.source)}</td><td>${mm(box.outerLength)}×${mm(box.outerWidth)}×${mm(box.outerHeight)} mm</td><td>${box.assignedProducts.map(esc).join(', ')}</td></tr>`).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>기업 포장 작업지시서</title><style>
    *{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;margin:24px;color:#172033;font-size:12px}h1{margin:0 0 6px;font-size:24px}h2{margin:26px 0 10px;font-size:17px;border-bottom:2px solid #172033;padding-bottom:6px}h3{font-size:14px;margin:0 0 8px}.meta{display:flex;gap:18px;flex-wrap:wrap;color:#526071}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.summary div{border:1px solid #d8dee8;border-radius:8px;padding:10px}.summary span{display:block;color:#64748b}.summary b{font-size:17px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd3dd;padding:6px 7px;vertical-align:top}th{background:#eef2f6;text-align:left}td small{display:block;color:#64748b;margin-top:2px}.warning{border:2px solid #a16207;background:#fffbeb;padding:12px;margin:14px 0;border-radius:8px}.mixed-card{break-inside:avoid;margin:12px 0 18px;padding:12px;border:1px solid #ccd3dd;border-radius:8px}.mixed-card h3 span{font-weight:400;color:#64748b;margin-left:8px}.actions{position:sticky;top:0;text-align:right;margin-bottom:10px}.actions button{padding:8px 14px}@media print{body{margin:10mm}.actions{display:none}.mixed-card{break-inside:avoid}}
  </style></head><body>
    <div class="actions"><button onclick="window.print()">인쇄 / PDF</button></div>
    <h1>기업 포장 작업지시서</h1>
    <div class="meta"><span>생성: ${esc(new Date().toLocaleString('ko-KR'))}</span><span>컨테이너: ${mm(container.length)}×${mm(container.width)}×${mm(container.height)}mm</span><span>최대중량: ${container.maxPayloadKg.toLocaleString()}kg</span></div>
    <div class="summary"><div><span>제품</span><b>${plan.assignments.length}종</b></div><div><span>포장박스</span><b>${plan.totalBoxes}EA</b></div><div><span>박스 규격</span><b>${plan.family.selectedBoxTypes}종</b></div><div><span>혼합박스</span><b>${plan.mixedCartons.length}EA</b></div><div><span>예상 컨테이너</span><b>${plan.shipment.containersRequired}대</b></div></div>
    ${unverified.length ? `<div class="warning"><b>강도 미검증 자동규격 ${unverified.length}종</b><br>아래 ⚠ 규격은 제조 강도 승인 전 실제 적층 작업에 사용하지 마세요. 시스템 적용값은 1단 / 상부허용 0kg입니다.</div>` : ''}
    <h2>1. 제품별 포장 지시</h2><table><thead><tr><th>제품</th><th>박스</th><th>외경</th><th>Full 입수</th><th>Full 수량</th><th>전용 잔량</th><th>Full 중량</th><th>외부 적층</th><th>취급 조건</th></tr></thead><tbody>${assignmentRows}</tbody></table>
    <h2>2. 운영 박스 패밀리</h2><table><thead><tr><th>박스 코드</th><th>박스명</th><th>종류</th><th>외경</th><th>적용 제품</th></tr></thead><tbody>${selectedBoxRows}</tbody></table>
    ${mixedRows ? `<h2>3. 혼합 잔량 박스 내부 배치</h2>${mixedRows}` : '<h2>3. 혼합 잔량 박스</h2><p>없음</p>'}
    <h2>4. 비용 / 운송 요약</h2><table><tbody><tr><th>확인 가능한 박스비</th><td>${plan.cost.knownCartonCost.toLocaleString()} ${esc(plan.cost.currency)}</td><th>미가격 박스</th><td>${plan.cost.unpricedCartons}EA</td></tr><tr><th>작업비</th><td>${plan.cost.handlingCost.toLocaleString()}</td><th>신규규격 셋업</th><td>${plan.cost.setupCost.toLocaleString()}</td></tr><tr><th>SKU 관리비</th><td>${plan.cost.cartonSkuCost.toLocaleString()}</td><th>컨테이너 운임</th><td>${plan.cost.freightCost.toLocaleString()}</td></tr></tbody></table>
    <p style="margin-top:22px;color:#64748b">본 문서는 포장 작업 계획용입니다. 자동설계 박스의 실제 압축강도, 원지/골종, 습도 영향, 테이핑 방식은 제조사 또는 포장 엔지니어 검증이 필요합니다. 컨테이너 최종 작업지시서는 별도 관성 PASS 후 생성합니다.</p>
  </body></html>`;
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
