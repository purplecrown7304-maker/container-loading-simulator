import * as XLSX from 'xlsx';
import type { ProductOrientationPolicy } from './engine/productPackagingOptimizer';
import type { CompanyProductItem } from './companyProduct';

export type ProductImportIssue = { row: number; code?: string; message: string };
export type ProductImportResult = { items: CompanyProductItem[]; issues: ProductImportIssue[]; totalRows: number };

const HEADERS = [
  '제품코드',
  '제품명',
  '길이(mm)',
  '폭(mm)',
  '높이(mm)',
  '중량(kg)',
  '출하수량',
  '박스적재필요',
  '박스당최대EA',
];

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return Number.NaN;
}

function first(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function parseYesNo(value: unknown): { value: boolean; valid: boolean } {
  if (value == null || String(value).trim() === '') return { value: true, valid: true };
  if (typeof value === 'boolean') return { value, valid: true };
  if (typeof value === 'number') {
    if (value === 1) return { value: true, valid: true };
    if (value === 0) return { value: false, valid: true };
    return { value: true, valid: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', '필요', '사용', 'o'].includes(normalized)) return { value: true, valid: true };
  if (['n', 'no', 'false', '0', '불필요', '미사용', 'x', '직접적재', '직접 적재'].includes(normalized)) return { value: false, valid: true };
  return { value: true, valid: false };
}

export async function parseProductWorkbook(file: File): Promise<ProductImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { items: [], issues: [{ row: 1, message: '엑셀 시트가 없습니다.' }], totalRows: 0 };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const map = new Map<string, CompanyProductItem>();
  const firstRowByCode = new Map<string, number>();
  const issues: ProductImportIssue[] = [];

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const id = String(first(row, ['제품코드', '코드', 'ProductCode', 'Code', 'ID'])).trim();
    const name = String(first(row, ['제품명', '이름', 'ProductName', 'Name'])).trim();
    const lengthMm = toNumber(first(row, ['길이(mm)', '길이', 'L(mm)', 'Length(mm)', 'Length']));
    const widthMm = toNumber(first(row, ['폭(mm)', '폭', 'W(mm)', 'Width(mm)', 'Width']));
    const heightMm = toNumber(first(row, ['높이(mm)', '높이', 'H(mm)', 'Height(mm)', 'Height']));
    const weightKg = toNumber(first(row, ['중량(kg)', '중량', 'Weight(kg)', 'Weight']));
    const quantity = toNumber(first(row, ['출하수량', '수량', 'Quantity', 'ShipmentQuantity']));
    const packaging = parseYesNo(first(row, ['박스적재필요', '박스 적재 필요', '박스포장필요', 'BoxRequired', 'RequiresBoxPackaging']));
    const rawMaxUnits = first(row, ['박스당최대EA', '박스당 최대EA', 'MaxUnitsPerBox']);
    const maxUnitsPerBox = String(rawMaxUnits).trim() === '' ? 24 : toNumber(rawMaxUnits);

    if (!id || !name) {
      issues.push({ row: excelRow, code: id || undefined, message: '제품코드 또는 제품명이 비어 있습니다.' });
      return;
    }
    if (![lengthMm, widthMm, heightMm, weightKg, quantity, maxUnitsPerBox].every(Number.isFinite)) {
      issues.push({ row: excelRow, code: id, message: '치수·중량·출하수량·박스당 최대EA 중 숫자가 아닌 값이 있습니다.' });
      return;
    }
    if (!packaging.valid) {
      issues.push({ row: excelRow, code: id, message: '박스적재필요 값은 Y/N, 필요/불필요, TRUE/FALSE, 1/0 중 하나여야 합니다.' });
      return;
    }
    if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0 || weightKg <= 0) {
      issues.push({ row: excelRow, code: id, message: '제품 치수와 중량은 0보다 커야 합니다.' });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      issues.push({ row: excelRow, code: id, message: '출하수량은 1 이상의 정수여야 합니다.' });
      return;
    }
    if (!Number.isInteger(maxUnitsPerBox) || maxUnitsPerBox < 1) {
      issues.push({ row: excelRow, code: id, message: '박스당 최대EA는 1 이상의 정수여야 합니다.' });
      return;
    }

    if (map.has(id)) {
      issues.push({ row: excelRow, code: id, message: `같은 제품코드가 여러 행에 있어 마지막 행을 적용했습니다. 최초 행: ${firstRowByCode.get(id)}` });
    } else {
      firstRowByCode.set(id, excelRow);
    }

    const orientationPolicy: ProductOrientationPolicy = 'base-rotation';
    map.set(id, {
      id,
      name,
      length: lengthMm / 1000,
      width: widthMm / 1000,
      height: heightMm / 1000,
      weightKg,
      quantity,
      requiresBoxPackaging: packaging.value,
      maxUnitsPerBox,
      orientationPolicy,
      allowRotation: true,
      cushioningM: 0.005,
      allowMixedCarton: true,
    });
  });

  return { items: [...map.values()], issues, totalRows: rows.length };
}

export function downloadProductTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ['PRD-001', '제품 A', 220, 150, 100, 1.2, 100, 'Y', 24],
    ['PRD-002', '제품 B', 310, 180, 120, 2.5, 60, 'N', 1],
  ]);
  worksheet['!cols'] = [16, 24, 13, 13, 13, 13, 13, 16, 17].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, 'company-product-base-template.xlsx');
}
