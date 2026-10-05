import { cargoColor } from './cargoColors';
import { reportTable } from './reportLayout';
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
  /** 박스 내 제품 총중량(박스 자중 제외). 적재 중량은 자중 포함 grossWeightKg 기준. */
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
      item.contentWeightKg?.toFixed(5) ?? '',
      item.unitsPerPackage ?? '',
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

export function buildShipmentInstructionSection(cargo: CargoItem[], result: ResultLike) {
  const snapshot = readShipmentInstructionSnapshot(cargo);
  const loaded = loadedCounts(result.placements);
  const remaining = remainingCounts(result.remaining);
  const specs = new Map<string, number>();
  const specCode = (l: number, w: number, h: number) => {
    const size = `${Math.round(l * 1000)} × ${Math.round(w * 1000)} × ${Math.round(h * 1000)} mm`;
    if (!specs.has(size)) specs.set(size, specs.size + 1);
    return `S${specs.get(size)}`;
  };
  const rows = snapshot ? snapshot.lines.map(item => {
    const loadedCount = familyCount(loaded, item.cargoId);
    const remainingCount = familyCount(remaining, item.cargoId) || Math.max(0, item.boxesNeeded - loadedCount);
    const actual = cargo.find(c => c.id === item.cargoId) ?? cargo.find(c => c.id === `${item.cargoId}-PARTIAL`);
    const color = cargoColor(item.cargoId, actual?.displayColor);
    const code = specCode(item.outerLength, item.outerWidth, item.outerHeight);
    const unit = item.packagingMode === 'box' ? 'BOX' : 'EA';
    return `<tr><td><b><i class="cargo-swatch" style="background:${color}"></i>${escapeHtml(item.productId)}</b><small>${escapeHtml(item.productName)}</small></td><td><b>${item.productQuantity} EA</b><small>적재 환산 ${loadedProductCount(item, loaded)} EA</small></td><td>${code}<small>${item.packagingMode === 'box' ? `${item.unitsPerBox} EA/BOX` : '직접 적재'}${item.partialUnits ? ` · 잔량 ${item.partialUnits} EA` : ''}</small></td><td><b>${item.boxesNeeded} ${unit}</b></td><td><b>${loadedCount} ${unit}</b><small class="${remainingCount ? 'shipment-warn' : 'shipment-ok'}">${remainingCount ? `미적재 ${remainingCount}` : '출하 준비'}</small></td><td class="check">□</td></tr>`;
  }).join('') : cargo.map(item => {
    const count = loaded.get(item.id) ?? 0;
    const waiting = remaining.get(item.id) ?? Math.max(0, item.quantity - count);
    const code = specCode(item.length, item.width, item.height);
    return `<tr><td><b>${escapeHtml(item.id)}</b><small>${escapeHtml(item.name)}</small></td><td>${item.quantity} EA</td><td>${code}<small>${item.weightKg} kg</small></td><td>${item.quantity} EA</td><td><b>${count} EA</b><small>미적재 ${waiting}</small></td><td class="check">□</td></tr>`;
  }).join('');
  return `<section class="shipment-block"><div class="shipment-head"><h3>출하 지시 · 수량 대조</h3><span>${snapshot ? `출하지시번호 ${escapeHtml(snapshot.shipmentNo)}` : '일반 화물 기준'}</span></div>${!snapshot ? '<p class="shipment-fallback">제품 흐름에서 생성된 출하정보가 없어 현재 화물 기준으로 표시합니다.</p>' : ''}${reportTable('출하 수량 대조표', `<table class="shipment-table"><colgroup><col style="width:24%"><col style="width:22%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:6%"></colgroup><thead><tr><th>품목</th><th>제품 출하수량</th><th>규격 / 입수</th><th>필요단위</th><th>적재결과</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table>`)}<div class="shipment-specs"><b>박스/화물 규격 · 길이 × 폭 × 높이</b>${[...specs].map(([size, number]) => `<span>S${number} · ${size}</span>`).join('')}</div></section>`;
}
