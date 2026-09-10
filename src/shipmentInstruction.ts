import type { ProductItem, ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import type { CargoItem, Placement } from './engine/types';

const STORAGE_KEY = 'container-loading-shipment-instruction-v1';

export type ShipmentInstructionLine = {
  productId: string;
  productName: string;
  productQuantity: number;
  boxId: string;
  boxName: string;
  unitsPerBox: number;
  boxesNeeded: number;
  grossWeightKg: number;
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
  products: ProductItem[],
  assignments: ProductPackagingAssignment[],
  cargo: CargoItem[],
) {
  if (typeof window === 'undefined') return;
  const productMap = new Map(products.map(item => [item.id, item]));
  const snapshot: ShipmentInstructionSnapshot = {
    shipmentNo: createShipmentNo(),
    createdAt: new Date().toISOString(),
    cargoSignature: cargoSignature(cargo),
    lines: assignments.map(item => ({
      productId: item.productId,
      productName: item.productName,
      productQuantity: productMap.get(item.productId)?.quantity ?? item.boxesNeeded * item.unitsPerBox,
      boxId: item.boxId,
      boxName: item.boxName,
      unitsPerBox: item.unitsPerBox,
      boxesNeeded: item.boxesNeeded,
      grossWeightKg: item.grossWeightKg,
      outerLength: item.outerLength,
      outerWidth: item.outerWidth,
      outerHeight: item.outerHeight,
    })),
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

export const SHIPMENT_INSTRUCTION_CSS = `
.shipment-block{margin:8px 0;border:2px solid #334155;border-radius:9px;overflow:hidden;break-inside:avoid}.shipment-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 9px;background:#172033;color:#fff}.shipment-head h2{font-size:14px}.shipment-head span{font-size:8px;color:#cbd5e1}.shipment-manual{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid #cbd5e1}.shipment-manual div{padding:6px 7px;border-right:1px solid #cbd5e1;min-height:34px}.shipment-manual div:last-child{border-right:0}.shipment-manual span{display:block;color:#64748b;font-size:7.5px}.shipment-manual b{display:block;margin-top:4px;font-size:9px;font-weight:700}.shipment-meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #cbd5e1;background:#f8fafc}.shipment-meta div{padding:6px 7px;border-right:1px solid #cbd5e1}.shipment-meta div:last-child{border-right:0}.shipment-meta span{display:block;color:#64748b;font-size:7.5px}.shipment-meta b{display:block;margin-top:2px;font-size:10px}.shipment-table{width:100%;border-collapse:collapse}.shipment-table th,.shipment-table td{padding:5px 6px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;vertical-align:middle}.shipment-table th:last-child,.shipment-table td:last-child{border-right:0}.shipment-table tr:last-child td{border-bottom:0}.shipment-table th{background:#e2e8f0;color:#334155;font-size:7.5px}.shipment-table td{font-size:8px}.shipment-table td b,.shipment-table td small{display:block}.shipment-table td small{margin-top:2px;color:#64748b;font-size:7px}.shipment-ok{color:#166534;font-weight:900}.shipment-warn{color:#b91c1c;font-weight:900}.shipment-check{text-align:center;font-size:15px}.shipment-fallback{padding:6px 8px;background:#fff7ed;color:#9a5b00;font-size:8px}
`;

export function buildShipmentInstructionSection(cargo: CargoItem[], result: ResultLike) {
  const snapshot = readShipmentInstructionSnapshot(cargo);
  const loaded = loadedCounts(result.placements);
  const remaining = remainingCounts(result.remaining);
  const generatedAt = new Date();

  if (snapshot) {
    const totalProducts = snapshot.lines.reduce((sum, item) => sum + item.productQuantity, 0);
    const totalBoxes = snapshot.lines.reduce((sum, item) => sum + item.boxesNeeded, 0);
    const loadedBoxes = snapshot.lines.reduce((sum, item) => sum + (loaded.get(`PKG-${item.productId}`) ?? 0), 0);
    const rows = snapshot.lines.map(item => {
      const cargoId = `PKG-${item.productId}`;
      const loadedBoxCount = loaded.get(cargoId) ?? 0;
      const remainingBoxCount = remaining.get(cargoId) ?? Math.max(0, item.boxesNeeded - loadedBoxCount);
      const estimatedLoadedProducts = Math.min(item.productQuantity, loadedBoxCount * item.unitsPerBox);
      const complete = remainingBoxCount === 0 && loadedBoxCount >= item.boxesNeeded;
      return `<tr>
        <td><b>${escapeHtml(item.productId)}</b><small>${escapeHtml(item.productName)}</small></td>
        <td><b>${item.productQuantity} EA</b><small>적재 환산 ${estimatedLoadedProducts} EA</small></td>
        <td><b>${escapeHtml(item.boxName)}</b><small>${Math.round(item.outerLength * 1000)}×${Math.round(item.outerWidth * 1000)}×${Math.round(item.outerHeight * 1000)}mm</small></td>
        <td><b>${item.unitsPerBox} EA/BOX</b><small>${item.grossWeightKg.toFixed(1)}kg/Full</small></td>
        <td><b>${item.boxesNeeded} BOX</b></td>
        <td><b>${loadedBoxCount} BOX</b><small>미적재 ${remainingBoxCount}</small></td>
        <td class="${complete ? 'shipment-ok' : 'shipment-warn'}">${complete ? '출하 준비' : '미적재 확인'}</td>
        <td class="shipment-check">□</td>
      </tr>`;
    }).join('');

    return `<section class="shipment-block">
      <div class="shipment-head"><h2>출하 지시</h2><span>출하지시번호 ${escapeHtml(snapshot.shipmentNo)}</span></div>
      <div class="shipment-manual"><div><span>거래처</span><b>________________</b></div><div><span>목적지</span><b>________________</b></div><div><span>차량/컨테이너 No.</span><b>________________</b></div><div><span>출고 예정</span><b>________________</b></div></div>
      <div class="shipment-meta"><div><span>제품 종류</span><b>${snapshot.lines.length} 종</b></div><div><span>제품 출하수량</span><b>${totalProducts} EA</b></div><div><span>필요 포장박스</span><b>${totalBoxes} BOX</b></div><div><span>현재 적재박스</span><b>${loadedBoxes} BOX</b></div></div>
      <table class="shipment-table"><thead><tr><th>제품</th><th>출하수량</th><th>선정 박스</th><th>입수/중량</th><th>필요박스</th><th>적재결과</th><th>상태</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table>
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
    <div class="shipment-fallback">제품 포장 흐름에서 생성된 출하정보가 없어 현재 적재 화물 기준으로 출하지시를 표시합니다.</div>
    <table class="shipment-table"><thead><tr><th>화물</th><th>출하수량</th><th colspan="2">규격/중량</th><th>지시수량</th><th>적재결과</th><th>상태</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}
