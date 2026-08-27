import * as XLSX from 'xlsx';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';

export type PackagingImportIssue = { sheet: string; row: number; code?: string; message: string };
export type PackagingWorkbookImport = { products: ProductItem[]; boxes: BoxCatalogItem[]; issues: PackagingImportIssue[] };

function num(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value.trim());
  return Number.NaN;
}

function bool(value: unknown, fallback = true) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', '허용', '가능', 'o'].includes(normalized)) return true;
  if (['n', 'no', 'false', '0', '금지', '불가', 'x'].includes(normalized)) return false;
  return fallback;
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
    if (!id || !name) return issues.push({ sheet: sheetName, row: excelRow, code: id || undefined, message: '제품 코드 또는 제품명이 비어 있습니다.' });
    if (![lengthMm, widthMm, heightMm, weightKg, quantity].every(Number.isFinite)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 치수·중량·수량에 숫자가 아닌 값이 있습니다.' });
    if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0 || weightKg <= 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 치수와 중량은 0보다 커야 합니다.' });
    if (!Number.isInteger(quantity) || quantity < 1) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '제품 수량은 1 이상의 정수여야 합니다.' });
    if (Number.isFinite(maxUnits) && (!Number.isInteger(maxUnits) || maxUnits < 1)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스당 최대EA는 비워두거나 1 이상의 정수여야 합니다.' });
    raw.push({ row: excelRow, item: { id, name, length: lengthMm / 1000, width: widthMm / 1000, height: heightMm / 1000, weightKg, quantity, maxUnitsPerBox: Number.isFinite(maxUnits) ? maxUnits : undefined, allowRotation: bool(row['90도회전허용'] ?? row['회전허용'] ?? row['AllowRotation']) } });
  });

  const grouped = new Map<string, Array<{ item: ProductItem; row: number }>>();
  raw.forEach(entry => grouped.set(entry.item.id, [...(grouped.get(entry.item.id) ?? []), entry]));
  const result: ProductItem[] = [];
  for (const [id, entries] of grouped) {
    const base = entries[0].item;
    const same = entries.every(({ item }) => item.name === base.name && item.length === base.length && item.width === base.width && item.height === base.height && item.weightKg === base.weightKg && item.maxUnitsPerBox === base.maxUnitsPerBox && item.allowRotation === base.allowRotation);
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
    };
    if (!id || !name) return issues.push({ sheet: sheetName, row: excelRow, code: id || undefined, message: '박스 코드 또는 이름이 비어 있습니다.' });
    if (seen.has(id)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '중복 박스 코드입니다.' });
    const required = [values.innerLength, values.innerWidth, values.innerHeight, values.outerLength, values.outerWidth, values.outerHeight, values.tareWeightKg, values.maxGrossWeightKg];
    if (!required.every(Number.isFinite)) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스 치수·자중·최대총중량에 숫자가 아닌 값이 있습니다.' });
    if ([values.innerLength, values.innerWidth, values.innerHeight, values.outerLength, values.outerWidth, values.outerHeight, values.maxGrossWeightKg].some(v => v <= 0) || values.tareWeightKg < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '박스 치수와 최대총중량은 0보다 커야 하고 자중은 0 이상이어야 합니다.' });
    if (values.outerLength < values.innerLength || values.outerWidth < values.innerWidth || values.outerHeight < values.innerHeight) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '외부 치수가 내부 치수보다 작습니다.' });
    if (Number.isFinite(values.maxTopLoadKg) && values.maxTopLoadKg < 0) return issues.push({ sheet: sheetName, row: excelRow, code: id, message: '상부 허용중량은 비워두거나 0 이상이어야 합니다.' });
    seen.add(id);
    result.push({ id, name, ...values, maxTopLoadKg: Number.isFinite(values.maxTopLoadKg) ? values.maxTopLoadKg : undefined });
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
    ['제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '중량(kg)', '수량', '박스당최대EA', '90도회전허용'],
    ['PRD-A', '제품 A', 220, 120, 80, 0.6, 240, 24, 'Y'],
    ['PRD-B', '제품 B', 310, 180, 110, 1.2, 120, 12, 'Y'],
  ]);
  const boxes = XLSX.utils.aoa_to_sheet([
    ['박스코드', '박스명', '내부L(mm)', '내부W(mm)', '내부H(mm)', '외부L(mm)', '외부W(mm)', '외부H(mm)', '박스자중(kg)', '최대총중량(kg)', '상부허용중량(kg)'],
    ['BOX-604040', '600×400×400', 590, 390, 390, 600, 400, 400, 0.8, 22, 80],
    ['BOX-503030', '500×300×300', 490, 290, 290, 500, 300, 300, 0.6, 18, 60],
  ]);
  products['!cols'] = [14, 20, 12, 12, 12, 12, 10, 14, 16].map(wch => ({ wch }));
  boxes['!cols'] = [14, 20, 12, 12, 12, 12, 12, 12, 14, 18, 18].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, products, 'Products');
  XLSX.utils.book_append_sheet(workbook, boxes, 'Boxes');
  XLSX.writeFile(workbook, 'product-packaging-template.xlsx');
}
