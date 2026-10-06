import * as XLSX from 'xlsx';
import type { ProductOrientationPolicy } from './engine/productPackagingOptimizer';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';

export type ProductImportIssue = { row: number; code?: string; message: string };
export type ProductImportResult = { items: CompanyProductItem[]; issues: ProductImportIssue[]; totalRows: number };

const HEADERS = [
  '제품코드',
  '제품명',
  '길이(mm)',
  '폭(mm)',
  '높이(mm)',
  '중량(kg)',
  '박스적재필요',
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
  const sheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'products') ?? workbook.SheetNames[0];
  if (!sheetName) return { items: [], issues: [{ row: 1, message: '엑셀 시트가 없습니다.' }], totalRows: 0 };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const map = new Map<string, CompanyProductItem>();
  const firstRowByCode = new Map<string, number>();
  const issues: ProductImportIssue[] = [];

  rows.forEach((row, index) => {
    const excelRow = typeof row.__rowNum__ === 'number' ? row.__rowNum__ + 1 : index + 2;
    const id = String(first(row, ['제품코드', '코드', 'ProductCode', 'Code', 'ID'])).trim();
    const name = String(first(row, ['제품명', '이름', 'ProductName', 'Name'])).trim();
    const lengthMm = toNumber(first(row, ['길이(mm)', '길이', 'L(mm)', 'Length(mm)', 'Length']));
    const widthMm = toNumber(first(row, ['폭(mm)', '폭', 'W(mm)', 'Width(mm)', 'Width']));
    const heightMm = toNumber(first(row, ['높이(mm)', '높이', 'H(mm)', 'Height(mm)', 'Height']));
    const weightKg = toNumber(first(row, ['중량(kg)', '중량', 'Weight(kg)', 'Weight']));
    const packaging = parseYesNo(first(row, ['박스적재필요', '박스 적재 필요', '박스포장필요', 'BoxRequired', 'RequiresBoxPackaging']));

    if (!id || !name) {
      issues.push({ row: excelRow, code: id || undefined, message: '제품코드 또는 제품명이 비어 있습니다.' });
      return;
    }
    if (![lengthMm, widthMm, heightMm, weightKg].every(Number.isFinite)) {
      issues.push({ row: excelRow, code: id, message: '치수 또는 중량에 숫자가 아닌 값이 있습니다.' });
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
      // 제품 마스터에는 출하수량/박스당 최대EA를 저장하지 않는다.
      // 실제 출하 수량은 메인 제품 선택에서, 박스당 입수는 포장 추천에서 규격/중량으로 자동 계산한다.
      quantity: 1,
      requiresBoxPackaging: packaging.value,
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
    ['PRD-001', '제품 A', 220, 150, 100, 1.2, 'Y'],
    ['PRD-002', '제품 B', 310, 180, 120, 2.5, 'N'],
  ]);
  worksheet['!cols'] = [16, 24, 13, 13, 13, 13, 16].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, 'company-product-base-template.xlsx');
}

/** The same seven master fields accepted by parseProductWorkbook; shipment data stays separate. */
export function createProductCatalogWorkbook(products: CompanyProductItem[]) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ...products.map(product => [
      product.id, product.name,
      product.length * 1000, product.width * 1000, product.height * 1000,
      product.weightKg, requiresBoxPackaging(product) ? 'Y' : 'N',
    ]),
  ]);
  worksheet['!cols'] = [20, 32, 15, 15, 15, 15, 18].map(wch => ({ wch }));
  products.forEach((_, index) => { worksheet[`A${index + 2}`].z = '@'; });
  worksheet['!autofilter'] = { ref: worksheet['!ref']! };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  const instructions = XLSX.utils.aoa_to_sheet([
    ['등록 제품 수정 안내'],
    ['Products 시트에서 제품명, 치수(mm), 중량(kg), 박스적재필요(Y/N)를 수정한 뒤 제품 엑셀 업로드로 불러오세요.'],
    ['기존 제품 수정 시 제품코드를 유지하세요. 새로운 제품코드는 신규 제품으로 추가됩니다.'],
    ['파일에서 행을 지워도 등록 제품은 삭제되지 않습니다. 삭제는 회사 제품 관리에서 진행하세요.'],
    ['제품코드는 텍스트로 입력해 앞자리 0을 유지하세요. 치수와 중량은 0보다 큰 숫자로 입력하세요.'],
    ['출하 수량과 기존 회전·완충·포장 조건은 이 파일의 수정 대상이 아니며 기존 값을 유지합니다.'],
  ]);
  instructions['!cols'] = [{ wch: 115 }];
  XLSX.utils.book_append_sheet(workbook, instructions, '수정 안내');
  return workbook;
}

export function downloadProductCatalog(products: CompanyProductItem[]) {
  XLSX.writeFile(createProductCatalogWorkbook(products), 'company-products.xlsx');
}

export function mergeProductCatalog(current: CompanyProductItem[], imported: CompanyProductItem[]) {
  const map = new Map(current.map(product => [product.id, product]));
  let added = 0, updated = 0;
  for (const item of imported) {
    const previous = map.get(item.id);
    if (previous) updated += 1;
    else added += 1;
    // Only the exported master fields may overwrite an existing product's packing conditions.
    const next = previous ? { ...previous, name: item.name, length: item.length,
      width: item.width, height: item.height, weightKg: item.weightKg,
      requiresBoxPackaging: item.requiresBoxPackaging } : { ...item };
    delete next.maxUnitsPerBox;
    map.set(item.id, next);
  }
  return { products: [...map.values()], added, updated };
}
