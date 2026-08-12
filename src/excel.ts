import * as XLSX from 'xlsx';
import type { CargoItem } from './engine/types';

export type ImportIssue = { row: number; message: string };
export type ImportResult = { items: CargoItem[]; issues: ImportIssue[] };

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
];

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.trim());
  return Number.NaN;
}

export async function parseCargoWorkbook(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
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

    if (!id || !name) {
      issues.push({ row: excelRow, message: '코드 또는 이름이 비어 있습니다.' });
      return;
    }
    if (seen.has(id)) {
      issues.push({ row: excelRow, message: `중복 코드 ${id}` });
      return;
    }
    if (![length, width, height, weightKg, quantity].every(Number.isFinite)) {
      issues.push({ row: excelRow, message: '치수·중량·수량에 숫자가 아닌 값이 있습니다.' });
      return;
    }
    if (length <= 0 || width <= 0 || height <= 0 || weightKg < 0 || quantity < 0) {
      issues.push({ row: excelRow, message: '치수는 0보다 커야 하며 중량·수량은 음수일 수 없습니다.' });
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
    });
  });

  return { items, issues };
}

export function downloadCargoTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ['BOX-A', 'BOX A', 0.6, 0.4, 0.35, 18, 70, 7, 100],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cargo');
  XLSX.writeFile(workbook, 'container-loading-cargo-template.xlsx');
}
