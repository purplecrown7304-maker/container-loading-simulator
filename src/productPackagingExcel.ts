import * as XLSX from 'xlsx';
import type { BoxCatalogItem, ProductItem, ProductOrientationPolicy } from './engine/productPackagingOptimizer';

export type PackagingImportIssue = { sheet: string; row: number; code?: string; message: string };
export type PackagingWorkbookImport = { products: ProductItem[]; boxes: BoxCatalogItem[]; issues: PackagingImportIssue[] };

function num(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value.trim());
  return Number.NaN;
}

function boolValue(value: unknown, fallback = true): { value: boolean; valid: boolean } {
  if (value == null || String(value).trim() === '') return { value: fallback, valid: true };
  if (typeof value === 'boolean') return { value, valid: true };
  if (typeof value === 'number') {
    if (value === 1) return { value: true, valid: true };
    if (value === 0) return { value: false, valid: true };
  }
  const normalized = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', '허용', '가능', 'o'].includes(normalized)) return { value: true, valid: true };
  if (['n', 'no', 'false', '0', '금지', '불가', 'x'].includes(normalized)) return { value: false, valid: true };
  return { value: fallback, valid: false };
}

function orientationValue(value: unknown, legacyRotation: unknown): { value: ProductOrientationPolicy; valid: boolean } {
  if (value == null || String(value).trim() === '') {
    const legacy = boolValue(legacyRotation, true);
    return { value: legacy.value ? 'base-rotation' : 'upright', valid: legacy.valid };
  }
  const normalized = String(value).trim().toLowerCase();
  if (['upright', 'up', '세워서', '세움', '회전금지', '고정'].includes(normalized)) return { value: 'upright', valid: true };
  if (['base-rotation', 'base', '90', '90도', '바닥면회전', '바닥면 90도'].includes(normalized)) return { value: 'base-rotation', valid: true };
  if (['any', '3d', '3축', '자유회전', '모든회전'].includes(normalized)) return { value: 'any', valid: true };
  return { value: 'base-rotation', valid: false };
}

function sheetByNames(workbook: XLSX.WorkBook, names: string[]) {
  const found = workbook.SheetNames.find(name => names.some(candidate => name.trim().toLowerCase() === candidate.toLowerCase()));
  return found ? { name: found, sheet: workbook.Sheets[found] } : null;
}

function parseProducts(sheetName: string, sheet: XLSX.WorkSheet, issues: PackagingImportIssue[]) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const raw: Array<{ item: ProductItem; row: number }> = [];
  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const id = String(row['제품코드'] ?? row['코드'] ?? row['ProductCode'] ?? row['Code'] ?? '').trim();
    const name = String(row['제품명'] ?? row['이름'] ?? row['ProductName'] ?? row['Name'] ?? '').trim();
    const lengthMm = num(row['길이(mm)'] ?? row['L(mm)'] ?? row['Length(mm)'] ?? row['Length']);
    const widthMm = num(row['폭(mm)'] ?? row['W(mm)'] ?? row['Width(mm)'] ?? row['Width']);
    const heightMm = num(row['높이(mm)'] ?? row['H(mm)'] ?? row['Height(mm)'] ?? row['Height']);
    const weightKg = num(row['중량(kg)'] ?? row['개당중량(kg)'] ?? row['Weight(kg)'] ?? row['Weight']);
    const quantity = num(row['수량'] ?? row['Quantity']);
    const maxUnits = num(row['박스당최대EA'] ?? row['박스당 최대수량'] ?? row['MaxUnitsPerBox']);
    const cushioningMm = num(row['완충여유(mm)'] ?? row['완충(mm)'] ?? row['Cushioning(mm)']);
    const maxInternalLayers = num(row['내부최대적층'] ?? row['박스내최대적층'] ?? row['MaxInternalLayers']);
    const orientation = orientationValue(row['회전정책'] ?? row['OrientationPolicy'], row['90도회전허용'] ?? row['회전허용'] ?? row['AllowRotation']);
    const fragile = boolValue(row['파손주의'] ?? row['Fragile'], false);
    const mixed = boolValue(row['혼합포장허용'] ?? row['혼합허용'] ?? row['AllowMixedCarton'], true);

    if (!id || !name) return issues.push({ sheet: sheetName, row: excelRow, code: id || undefined, message: '제품 코드 또는 제품명이 비어 있습니다.' });
    if (![lengthMm, widthMm, heightMm, weightKg, quantity].every(Number.isFinite)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 치수·중량·수량에 숫자가 아닌 값이 있습니다.' });
    if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0 || weightKg <= 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 치수와 중량은 0보다 커야 합니다.' });
    if (!Number.isInteger(quantity) || quantity < 1) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 수량은 1 이상의 정수여야 합니다.' });
    if (Number.isFinite(maxUnits) && (!Number.isInteger(maxUnits) || maxUnits < 1)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스당 최대EA는 비워두거나 1 이상의 정수여야 합니다.' });
    if (Number.isFinite(cushioningMm) && cushioningMm < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '완충여유는 비워두거나 0 이상이어야 합니다.' });
    if (Number.isFinite(maxInternalLayers) && (!Number.isInteger(maxInternalLayers) || maxInternalLayers < 1)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '내부최대적층은 비워두거나 1 이상의 정수여야 합니다.' });
    if (!orientation.valid) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '회전정책은 upright/base-rotation/any 또는 지원되는 한글 값이어야 합니다.' });
    if (!fragile.valid) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '파손주의 값은 Y/N, TRUE/FALSE, 1/0 중 하나여야 합니다.' });
    if (!mixed.valid) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '혼합포장허용 값은 Y/N, TRUE/FALSE, 1/0 중 하나여야 합니다.' });

    raw.push({
      row: excelRow,
      item: {
        id,
        name,
        length: lengthMm / 1000,
        width: widthMm / 1000,
        height: heightMm / 1000,
        weightKg,
        quantity,
        maxUnitsPerBox: Number.isFinite(maxUnits) ? maxUnits : undefined,
        allowRotation: orientation.value !== 'upright',
        orientationPolicy: orientation.value,
        cushioningM: Number.isFinite(cushioningMm) ? cushioningMm / 1000 : undefined,
        maxInternalLayers: Number.isFinite(maxInternalLayers) ? maxInternalLayers : undefined,
        fragile: fragile.value,
        allowMixedCarton: mixed.value,
      },
    });
  });

  const grouped = new Map<string, Array<{ item: ProductItem; row: number }>>();
  raw.forEach(entry => grouped.set(entry.item.id, [...(grouped.get(entry.item.id) ?? []), entry]));
  const result: ProductItem[] = [];
  for (const [id, entries] of grouped) {
    const base = entries[0].item;
    const same = entries.every(({ item }) =>
      item.name === base.name
      && item.length === base.length && item.width === base.width && item.height === base.height
      && item.weightKg === base.weightKg
      && item.maxUnitsPerBox === base.maxUnitsPerBox
      && item.orientationPolicy === base.orientationPolicy
      && item.cushioningM === base.cushioningM
      && item.maxInternalLayers === base.maxInternalLayers
      && item.fragile === base.fragile
      && item.allowMixedCarton === base.allowMixedCarton,
    );
    if (!same) {
      issues.push({ sheet: sheetName, row: entries[0].row, code: id, message: '동일 제품코드에 서로 다른 치수·중량·포장조건이 있습니다.' });
      continue;
    }
    result.push({ ...base, quantity: entries.reduce((sum, entry) => sum + entry.item.quantity, 0) });
  }
  return result;
}

function parseBoxes(sheetName: string, sheet: XLSX.WorkSheet, issues: PackagingImportIssue[]) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const seen = new Set<string>();
  const result: BoxCatalogItem[] = [];
  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const id = String(row['박스코드'] ?? row['코드'] ?? row['BoxCode'] ?? row['Code'] ?? '').trim();
    const name = String(row['박스명'] ?? row['이름'] ?? row['BoxName'] ?? row['Name'] ?? '').trim();
    const values = {
      innerLength: num(row['내부L(mm)'] ?? row['내부길이(mm)'] ?? row['InnerL(mm)']) / 1000,
      innerWidth: num(row['내부W(mm)'] ?? row['내부폭(mm)'] ?? row['InnerW(mm)']) / 1000,
      innerHeight: num(row['내부H(mm)'] ?? row['내부높이(mm)'] ?? row['InnerH(mm)']) / 1000,
      outerLength: num(row['외부L(mm)'] ?? row['외부길이(mm)'] ?? row['OuterL(mm)']) / 1000,
      outerWidth: num(row['외부W(mm)'] ?? row['외부폭(mm)'] ?? row['OuterW(mm)']) / 1000,
      outerHeight: num(row['외부H(mm)'] ?? row['외부높이(mm)'] ?? row['OuterH(mm)']) / 1000,
      tareWeightKg: num(row['박스자중(kg)'] ?? row['자중(kg)'] ?? row['TareWeight(kg)']),
      maxGrossWeightKg: num(row['최대총중량(kg)'] ?? row['MaxGrossWeight(kg)']),
      maxTopLoadKg: num(row['상부허용중량(kg)'] ?? row['MaxTopLoadKg']),
      unitCost: num(row['박스단가'] ?? row['단가'] ?? row['UnitCost']),
    };
    if (!id || !name) return issues.push({ sheet: sheetName, row: excelRow, code: id || undefined, message: '박스 코드 또는 이름이 비어 있습니다.' });
    if (seen.has(id)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '중복 박스 코드입니다.' });
    const required = [values.innerLength, values.innerWidth, values.innerHeight, values.outerLength, values.outerWidth, values.outerHeight, values.tareWeightKg, values.maxGrossWeightKg];
    if (!required.every(Number.isFinite)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스 치수·자중·최대총중량에 숫자가 아닌 값이 있습니다.' });
    if ([values.innerLength, values.innerWidth, values.innerHeight, values.outerLength, values.outerWidth, values.outerHeight, values.maxGrossWeightKg].some(v => v <= 0) || values.tareWeightKg < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스 치수와 최대총중량은 0보다 커야 하고 자중은 0 이상이어야 합니다.' });
    if (values.outerLength < values.innerLength || values.outerWidth < values.innerWidth || values.outerHeight < values.innerHeight) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '외부 치수가 내부 치수보다 작습니다.' });
    if (Number.isFinite(values.maxTopLoadKg) && values.maxTopLoadKg < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '상부 허용중량은 비워두거나 0 이상이어야 합니다.' });
    if (Number.isFinite(values.unitCost) && values.unitCost < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스 단가는 비워두거나 0 이상이어야 합니다.' });
    seen.add(id);
    result.push({
      id,
      name,
      innerLength: values.innerLength,
      innerWidth: values.innerWidth,
      innerHeight: values.innerHeight,
      outerLength: values.outerLength,
      outerWidth: values.outerWidth,
      outerHeight: values.outerHeight,
      tareWeightKg: values.tareWeightKg,
      maxGrossWeightKg: values.maxGrossWeightKg,
      maxTopLoadKg: Number.isFinite(values.maxTopLoadKg) ? values.maxTopLoadKg : undefined,
      unitCost: Number.isFinite(values.unitCost) ? values.unitCost : undefined,
    });
  });
  return result;
}

export async function parseProductPackagingWorkbook(file: File): Promise<PackagingWorkbookImport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const issues: PackagingImportIssue[] = [];
  const productsSheet = sheetByNames(workbook, ['Products', 'Product', '제품', '제품목록']);
  const boxesSheet = sheetByNames(workbook, ['Boxes', 'Box', '박스', '박스목록']);
  if (!productsSheet) issues.push({ sheet: 'Products', row: 1, message: 'Products(제품) 시트를 찾을 수 없습니다.' });
  const products = productsSheet ? parseProducts(productsSheet.name, productsSheet.sheet, issues) : [];
  const boxes = boxesSheet ? parseBoxes(boxesSheet.name, boxesSheet.sheet, issues) : [];
  return { products, boxes, issues };
}

export function downloadProductPackagingTemplate() {
  const workbook = XLSX.utils.book_new();
  const products = XLSX.utils.aoa_to_sheet([
    ['제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '중량(kg)', '수량', '박스당최대EA', '회전정책', '완충여유(mm)', '내부최대적층', '파손주의', '혼합포장허용'],
    ['PRD-A', '제품 A', 220, 120, 80, 0.6, 240, 24, 'base-rotation', 5, 3, 'N', 'Y'],
    ['PRD-B', '제품 B', 310, 180, 110, 1.2, 120, 12, 'upright', 10, 1, 'Y', 'N'],
  ]);
  const boxes = XLSX.utils.aoa_to_sheet([
    ['박스코드', '박스명', '내부L(mm)', '내부W(mm)', '내부H(mm)', '외부L(mm)', '외부W(mm)', '외부H(mm)', '박스자중(kg)', '최대총중량(kg)', '상부허용중량(kg)', '박스단가'],
    ['BOX-604040', '600×400×400', 590, 390, 390, 600, 400, 400, 0.8, 22, 80, 1.2],
    ['BOX-503030', '500×300×300', 490, 290, 290, 500, 300, 300, 0.6, 18, 60, 0.9],
  ]);
  products['!cols'] = [14, 20, 12, 12, 12, 12, 10, 14, 18, 16, 16, 12, 16].map(wch => ({ wch }));
  boxes['!cols'] = [14, 20, 12, 12, 12, 12, 12, 12, 14, 18, 18, 12].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, products, 'Products');
  XLSX.utils.book_append_sheet(workbook, boxes, 'Boxes');
  XLSX.writeFile(workbook, 'product-packaging-template.xlsx');
}
