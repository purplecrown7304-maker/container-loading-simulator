import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import type { ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import type { CargoItem, Placement } from './engine/types';

const STORAGE_KEY = 'container-loading-shipment-instruction-v1';

export type ShipmentInstructionLine = {
  productId: string;
  productName: string;
  productQuantity: number;
  packagingMode: 'box' | 'direct';
  cargoId: string;
  boxId: string;
  boxName: string;
  unitsPerBox: number;
  boxesNeeded: number;
  /** 포장 설계 검증용 총중량(박스 자중 포함). */
  grossWeightKg: number;
  /** 실제 적재/표시에 사용하는 박스 내 제품 총중량(박스 자중 제외). */
  contentWeightKg?: number;
  /** 마지막 잔량박스에 들어가는 실제 제품 EA. */
  partialUnits?: number;
  /** 마지막 잔량박스의 실제 제품 총중량. */
  partialContentWeightKg?: number;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
};

export type ShipmentInstructionSnapshot = {
  shipmentNo: string;
  createdAt: string;
  cargoSignature: string;
  lines: ShipmentInstructionLine[];
};

type ResultLike = {
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number }>;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function createShipmentNo(now = new Date()) {
  return `SHIP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function cargoSignature(cargo: CargoItem[]) {
  return [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [
      item.id,
      item.quantity,
      item.length.toFixed(5),
      item.width.toFixed(5),
      item.height.toFixed(5),
      item.weightKg.toFixed(5),
    ].join(':'))
    .join('|');
}

export function writeShipmentInstructionSnapshot(
  products: CompanyProductItem[],
  assignments: ProductPackagingAssignment[],
  cargo: CargoItem[],
) {
  if (typeof window === 'undefined') return;
  const assignmentMap = new Map(assignments.map(item => [item.productId, item]));
  const lines: ShipmentInstructionLine[] = [];

  for (const product of products) {
    if (!requiresBoxPackaging(product)) {
      lines.push({
        productId: product.id,
        productName: product.name,
        productQuantity: product.quantity,
        packagingMode: 'direct',
        cargoId: `DIRECT-${product.id}`,
        boxId: '',
        boxName: '박스 없이 직접 적재',
        unitsPerBox: 1,
        boxesNeeded: product.quantity,
        grossWeightKg: product.weightKg,
        contentWeightKg: product.weightKg,
        outerLength: product.length,
        outerWidth: product.width,
        outerHeight: product.height,
      });
      continue;
    }

    const item = assignmentMap.get(product.id);
    if (!item) continue;
    const partialUnits = product.quantity % Math.max(1, item.unitsPerBox);
    lines.push({
      productId: item.productId,
      productName: item.productName,
      productQuantity: product.quantity,
      packagingMode: 'box',
      cargoId: `PKG-${item.productId}`,
      boxId: item.boxId,
      boxName: item.boxName,
      unitsPerBox: item.unitsPerBox,
      boxesNeeded: item.boxesNeeded,
      grossWeightKg: item.grossWeightKg,
      contentWeightKg: item.unitsPerBox * product.weightKg,
      partialUnits: partialUnits || undefined,
      partialContentWeightKg: partialUnits ? partialUnits * product.weightKg : undefined,
      outerLength: item.outerLength,
      outerWidth: item.outerWidth,
      outerHeight: item.outerHeight,
    });
  }

  const snapshot: ShipmentInstructionSnapshot = {
    shipmentNo: createShipmentNo(),
    createdAt: new Date().toISOString(),
    cargoSignature: cargoSignature(cargo),
    lines,
  };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* storage unavailable */ }
}

export function readShipmentInstructionSnapshot(cargo?: CargoItem[]): ShipmentInstructionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShipmentInstructionSnapshot;
    if (!parsed?.shipmentNo || !Array.isArray(parsed.lines)) return null;
    if (cargo && parsed.cargoSignature !== cargoSignature(cargo)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadedCounts(placements: Placement[]) {
  const counts = new Map<string, number>();
  placements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return counts;
}

function remainingCounts(remaining: ResultLike['remaining']) {
  const counts = new Map<string, number>();
  remaining.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + item.quantity));
  return counts;
}

function familyCount(counts: Map<string, number>, cargoId: string) {
  return (counts.get(cargoId) ?? 0) + (counts.get(`${cargoId}-PARTIAL`) ?? 0);
}

function loadedProductCount(line: ShipmentInstructionLine, loaded: Map<string, number>) {
  const baseLoaded = loaded.get(line.cargoId) ?? 0;
  if (line.packagingMode === 'direct') return Math.min(line.productQuantity, baseLoaded);
  const units = Math.max(1, line.unitsPerBox);
  const fullBoxesExpected = Math.floor(line.productQuantity / units);
  const remainderUnits = line.partialUnits ?? (line.productQuantity % units);
  const partialLoaded = loaded.get(`${line.cargoId}-PARTIAL`) ?? 0;
  const baseProducts = fullBoxesExpected === 0 && remainderUnits > 0
    ? baseLoaded * remainderUnits
    : Math.min(baseLoaded, fullBoxesExpected) * units;
  return Math.min(line.productQuantity, baseProducts + partialLoaded * (remainderUnits || units));
}

export const SHIPMENT_INSTRUCTION_CSS = `
.shipment-block{margin:8px 0;border:2px solid #334155;border-radius:9px;overflow:hidden;break-inside:avoid}.shipment-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 9px;background:#172033;color:#fff}.shipment-head h2{font-size:14px}.shipment-head span{font-size:8px;color:#cbd5e1}.shipment-manual{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid #cbd5e1}.shipment-manual div{padding:6px 7px;border-right:1px solid #cbd5e1;min-height:34px}.shipment-manual div:last-child{border-right:0}.shipment-manual span{display:block;color:#64748b;font-size:7.5px}.shipment-manual b{display:block;margin-top:4px;font-size:9px;font-weight:700}.shipment-meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #cbd5e1;background:#f8fafc}.shipment-meta div{padding:6px 7px;border-right:1px solid #cbd5e1}.shipment-meta div:last-child{border-right:0}.shipment-meta span{display:block;color:#64748b;font-size:7.5px}.shipment-meta b{display:block;margin-top:2px;font-size:10px}.shipment-table{width:100%;border-collapse:collapse}.shipment-table th,.shipment-table td{padding:5px 6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;vertical-align:middle}.shipment-table th:last-child,.shipment-table td:last-child{border-right:0}.shipment-table tr:last-child td{border-bottom:0}.shipment-table th{background:#e2e8f0;color:#334155;font-size:7.5px}.shipment-table td{font-size:8px}.shipment-table td b,.shipment-table td small{display:block}.shipment-table td small{margin-top:2px;color:#64748b;font-size:7px}.shipment-ok{color:#166534;font-weight:900}.shipment-warn{color:#b91c1c;font-weight:900}.shipment-check{text-align:center;font-size:15px}.shipment-fallback{padding:6px 8px;background:#fff7ed;color:#9a5b00;font-size:8px}.shipment-direct{color:#6d28d9;font-weight:900}
`;

export function buildShipmentInstructionSection(cargo: CargoItem[], result: ResultLike) {
  const snapshot = readShipmentInstructionSnapshot(cargo);
  const loaded = loadedCounts(result.placements);
  const remaining = remainingCounts(result.remaining);
  const generatedAt = new Date();

  if (snapshot) {
    const totalProducts = snapshot.lines.reduce((sum, item) => sum + item.productQuantity, 0);
    const boxCount = snapshot.lines.filter(item => item.packagingMode === 'box').reduce((sum, item) => sum + item.boxesNeeded, 0);
    const directCount = snapshot.lines.filter(item => item.packagingMode === 'direct').reduce((sum, item) => sum + item.boxesNeeded, 0);
    const loadedUnits = snapshot.lines.reduce((sum, item) => sum + familyCount(loaded, item.cargoId), 0);
    const rows = snapshot.lines.map(item => {
      const loadedCount = familyCount(loaded, item.cargoId);
      const familyRemaining = familyCount(remaining, item.cargoId);
      const remainingCount = familyRemaining || Math.max(0, item.boxesNeeded - loadedCount);
      const estimatedLoadedProducts = loadedProductCount(item, loaded);
      const complete = remainingCount === 0 && loadedCount >= item.boxesNeeded;
      const unit = item.packagingMode === 'box' ? 'BOX' : 'EA';
      const packingText = item.packagingMode === 'box' ? item.boxName : '직접 적재';
      const intakeText = item.packagingMode === 'box' ? `${item.unitsPerBox} EA/BOX` : '1 EA/적재단위';
      const contentWeight = item.contentWeightKg ?? item.grossWeightKg;
      const weightText = item.packagingMode === 'box'
        ? item.partialUnits
          ? `제품 ${contentWeight.toFixed(1)}kg/BOX · 잔량 ${item.partialContentWeightKg?.toFixed(1)}kg`
          : `제품 ${contentWeight.toFixed(1)}kg/BOX`
        : `${contentWeight.toFixed(1)}kg/EA`;
      return `<tr>
        <td><b>${escapeHtml(item.productId)}</b><small>${escapeHtml(item.productName)}</small></td>
        <td><b>${item.productQuantity} EA</b><small>적재 환산 ${estimatedLoadedProducts} EA</small></td>
        <td class="${item.packagingMode === 'direct' ? 'shipment-direct' : ''}"><b>${escapeHtml(packingText)}</b><small>${Math.round(item.outerLength * 1000)}×${Math.round(item.outerWidth * 1000)}×${Math.round(item.outerHeight * 1000)}mm</small></td>
        <td><b>${intakeText}</b><small>${weightText}</small></td>
        <td><b>${item.boxesNeeded} ${unit}</b></td>
        <td><b>${loadedCount} ${unit}</b><small>미적재 ${remainingCount}</small></td>
        <td class="${complete ? 'shipment-ok' : 'shipment-warn'}">${complete ? '출하 준비' : '미적재 확인'}</td>
        <td class="shipment-check">□</td>
      </tr>`;
    }).join('');

    return `<section class="shipment-block">
      <div class="shipment-head"><h2>출하 지시</h2><span>출하지시번호 ${escapeHtml(snapshot.shipmentNo)}</span></div>
      <div class="shipment-manual"><div><span>거래처</span><b>________________</b></div><div><span>목적지</span><b>________________</b></div><div><span>차량/컨테이너 No.</span><b>________________</b></div><div><span>출고 예정</span><b>________________</b></div></div>
      <div class="shipment-meta"><div><span>제품 종류</span><b>${snapshot.lines.length} 종</b></div><div><span>제품 출하수량</span><b>${totalProducts} EA</b></div><div><span>포장/직접 적재</span><b>${boxCount} BOX · ${directCount} EA</b></div><div><span>현재 적재단위</span><b>${loadedUnits} 개</b></div></div>
      <table class="shipment-table"><thead><tr><th>제품</th><th>출하수량</th><th>포장/적재 방식</th><th>입수/제품중량</th><th>필요단위</th><th>적재결과</th><th>상태</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }

  const rows = cargo.map(item => {
    const loadedCount = loaded.get(item.id) ?? 0;
    const remainingCount = remaining.get(item.id) ?? Math.max(0, item.quantity - loadedCount);
    const complete = remainingCount === 0 && loadedCount >= item.quantity;
    return `<tr><td><b>${escapeHtml(item.id)}</b><small>${escapeHtml(item.name)}</small></td><td><b>${item.quantity} EA</b></td><td colspan="2"><small>${Math.round(item.length * 1000)}×${Math.round(item.width * 1000)}×${Math.round(item.height * 1000)}mm · ${item.weightKg}kg</small></td><td><b>${item.quantity} EA</b></td><td><b>${loadedCount} EA</b><small>미적재 ${remainingCount}</small></td><td class="${complete ? 'shipment-ok' : 'shipment-warn'}">${complete ? '출하 준비' : '미적재 확인'}</td><td class="shipment-check">□</td></tr>`;
  }).join('');

  return `<section class="shipment-block">
    <div class="shipment-head"><h2>출하 지시</h2><span>${generatedAt.toLocaleString('ko-KR')} · 일반 화물 기준</span></div>
    <div class="shipment-manual"><div><span>거래처</span><b>________________</b></div><div><span>목적지</span><b>________________</b></div><div><span>차량/컨테이너 No.</span><b>________________</b></div><div><span>출고 예정</span><b>________________</b></div></div>
    <div class="shipment-fallback">제품 흐름에서 생성된 출하정보가 없어 현재 적재 화물 기준으로 출하지시를 표시합니다.</div>
    <table class="shipment-table"><thead><tr><th>화물</th><th>출하수량</th><th colspan="2">규격/중량</th><th>지시수량</th><th>적재결과</th><th>상태</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}
