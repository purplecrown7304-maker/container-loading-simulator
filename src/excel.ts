import * as XLSX from 'xlsx';
import type { CargoItem } from './engine/types';

export type ImportIssue = { row: number; code?: string; message: string };
export type ImportResult = { items: CargoItem[]; issues: ImportIssue[]; totalRows: number };

const headers = [
  '코드',
  '이름',
  '길이(m)',
  '폭(m)',
  '높이(m)',
  '중량(kg)',
  '수량',
  '최대적층단',
  '상부허용중량(kg)',
  '90도회전허용',
];

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return Number.NaN;
}

function toRotationPolicy(value: unknown): { value: boolean; valid: boolean } {
  if (value == null || String(value).trim() === '') return { value: true, valid: true };
  if (typeof value === 'boolean') return { value, valid: true };
  if (typeof value === 'number') {
    if (value === 1) return { value: true, valid: true };
    if (value === 0) return { value: false, valid: true };
    return { value: true, valid: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', '허용', '가능', 'o'].includes(normalized)) return { value: true, valid: true };
  if (['n', 'no', 'false', '0', '금지', '불가', 'x'].includes(normalized)) return { value: false, valid: true };
  return { value: true, valid: false };
}

export async function parseCargoWorkbook(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { items: [], issues: [{ row: 1, message: '엑셀 시트가 없습니다.' }], totalRows: 0 };

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const items: CargoItem[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const id = String(row['코드'] ?? row['Code'] ?? row['ID'] ?? '').trim();
    const name = String(row['이름'] ?? row['Name'] ?? '').trim();
    const length = toNumber(row['길이(m)'] ?? row['길이'] ?? row['Length']);
    const width = toNumber(row['폭(m)'] ?? row['폭'] ?? row['Width']);
    const height = toNumber(row['높이(m)'] ?? row['높이'] ?? row['Height']);
    const weightKg = toNumber(row['중량(kg)'] ?? row['중량'] ?? row['Weight']);
    const quantity = toNumber(row['수량'] ?? row['Quantity']);
    const maxStackLayers = toNumber(row['최대적층단'] ?? row['최대 적층단'] ?? row['MaxStackLayers']);
    const maxTopLoadKg = toNumber(row['상부허용중량(kg)'] ?? row['상부허용'] ?? row['MaxTopLoadKg']);
    const rotation = toRotationPolicy(row['90도회전허용'] ?? row['회전허용'] ?? row['AllowRotation']);

    if (!id || !name) {
      issues.push({ row: excelRow, code: id || undefined, message: '코드 또는 이름이 비어 있습니다.' });
      return;
    }
    if (seen.has(id)) {
      issues.push({ row: excelRow, code: id, message: `파일 안에서 코드 ${id}가 중복되었습니다.` });
      return;
    }
    if (![length, width, height, weightKg, quantity].every(Number.isFinite)) {
      issues.push({ row: excelRow, code: id, message: '치수·중량·수량 중 숫자가 아닌 값이 있습니다.' });
      return;
    }
    if (length <= 0 || width <= 0 || height <= 0 || weightKg < 0 || quantity < 0) {
      issues.push({ row: excelRow, code: id, message: '치수는 0보다 커야 하며 중량·수량은 음수일 수 없습니다.' });
      return;
    }
    if (Number.isFinite(maxStackLayers) && maxStackLayers <= 0) {
      issues.push({ row: excelRow, code: id, message: '최대 적층단은 1 이상이어야 합니다.' });
      return;
    }
    if (Number.isFinite(maxTopLoadKg) && maxTopLoadKg < 0) {
      issues.push({ row: excelRow, code: id, message: '상부 허용중량은 음수일 수 없습니다.' });
      return;
    }
    if (!rotation.valid) {
      issues.push({ row: excelRow, code: id, message: '90도회전허용 값은 Y/N, 허용/금지, TRUE/FALSE, 1/0 중 하나여야 합니다.' });
      return;
    }

    seen.add(id);
    items.push({
      id,
      name,
      length,
      width,
      height,
      weightKg,
      quantity: Math.floor(quantity),
      maxStackLayers: Number.isFinite(maxStackLayers) && maxStackLayers > 0 ? Math.floor(maxStackLayers) : undefined,
      maxTopLoadKg: Number.isFinite(maxTopLoadKg) && maxTopLoadKg > 0 ? maxTopLoadKg : undefined,
      allowRotation: rotation.value,
    });
  });

  return { items, issues, totalRows: rows.length };
}

export function downloadCargoTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ['BOX-A', 'BOX A', 0.6, 0.4, 0.35, 18, 70, 7, 100, 'Y'],
    ['BOX-B', 'BOX B', 0.5, 0.35, 0.3, 12, 55, 7, 80, 'N'],
  ]);
  worksheet['!cols'] = [12, 18, 12, 12, 12, 12, 10, 14, 20, 16].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cargo');
  XLSX.writeFile(workbook, 'container-loading-cargo-template.xlsx');
}
