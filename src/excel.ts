import * as XLSX from 'xlsx';
import { preflightCargoInput } from './engine/inputPreflight';
import type { CargoItem } from './engine/types';
import { CARTON_MATERIAL_ORDER, CARTON_MATERIALS, type CartonMaterial } from './engine/cartonMaterial';

const MATERIAL_ESTIMATE_LABEL = '재질 추정';

/** Accepts the label shown on screen or the internal key; blank clears. */
function parseCartonMaterial(value: unknown): { valid: boolean; value: CartonMaterial | undefined } {
  const text = String(value ?? '').trim();
  if (!text) return { valid: true, value: undefined };
  const match = CARTON_MATERIAL_ORDER.find(key => key === text || CARTON_MATERIALS[key].label === text);
  return match ? { valid: true, value: match } : { valid: false, value: undefined };
}

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
  '하역순서',
];

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return Number.NaN;
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === '';
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

function mergeWorkbookDuplicates(items: CargoItem[], firstRowById: Map<string, number>, issues: ImportIssue[]) {
  const grouped = new Map<string, CargoItem[]>();
  for (const item of items) {
    const group = grouped.get(item.id) ?? [];
    group.push(item);
    grouped.set(item.id, group);
  }

  const merged: CargoItem[] = [];
  for (const [id, group] of grouped) {
    const active = group.filter((item) => item.quantity > 0);
    if (!active.length) {
      // Zero quantity is a valid inactive SKU. Keep one row visible in the imported list.
      merged.push(group[0]);
      continue;
    }

    const preflight = preflightCargoInput(group);
    if (preflight.rejected.length) {
      for (const rejected of preflight.rejected) {
        issues.push({
          row: firstRowById.get(id) ?? 2,
          code: rejected.cargoId,
          message: rejected.reason,
        });
      }
      continue;
    }

    const normalized = preflight.cargo[0];
    if (normalized) merged.push(normalized);
  }
  return merged;
}

export async function parseCargoWorkbook(file: File): Promise<ImportResult> {
  return parseWorkbook(file);
}

export async function parseBoxCatalogWorkbook(file: File): Promise<ImportResult> {
  // Catalog registration does not select cargo for loading. Quantities are chosen later.
  return parseWorkbook(file, 0);
}

async function parseWorkbook(file: File, defaultQuantity?: number): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { items: [], issues: [{ row: 1, message: '엑셀 시트가 없습니다.' }], totalRows: 0 };

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const rawItems: CargoItem[] = [];
  const issues: ImportIssue[] = [];
  const firstRowById = new Map<string, number>();

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const id = String(row['코드'] ?? row['Code'] ?? row['ID'] ?? '').trim();
    const name = String(row['이름'] ?? row['Name'] ?? '').trim();
    const length = toNumber(row['길이(m)'] ?? row['길이'] ?? row['Length']);
    const width = toNumber(row['폭(m)'] ?? row['폭'] ?? row['Width']);
    const height = toNumber(row['높이(m)'] ?? row['높이'] ?? row['Height']);
    const weightKg = toNumber(row['중량(kg)'] ?? row['중량'] ?? row['Weight']);
    const quantityValue = row['수량'] ?? row['Quantity'];
    const quantity = defaultQuantity != null && (quantityValue == null || String(quantityValue).trim() === '')
      ? defaultQuantity
      : toNumber(quantityValue);
    const stackValue = row['최대적층단'] ?? row['최대 적층단'] ?? row['MaxStackLayers'];
    const topLoadValue = row['상부 허용하중(kg)'] ?? row['상부허용하중(kg)'] ?? row['상부허용중량(kg)'] ?? row['상부허용'] ?? row['MaxTopLoadKg'];
    const unloadValue = row['하역순서'] ?? row['하역 순서'] ?? row['UnloadPriority'];
    const maxStackLayers = toNumber(stackValue);
    const maxTopLoadKg = toNumber(topLoadValue);
    const unloadPriority = toNumber(unloadValue);
    const rotationValue = row['90도회전허용'] ?? row['회전허용'] ?? row['AllowRotation'];
    const rotation = toRotationPolicy(rotationValue);
    const materialValue = row['재질'] ?? row['Material'];
    const material = parseCartonMaterial(materialValue);
    const sourceValue = row['상부허용하중 출처'] ?? row['상부 허용하중 출처'] ?? row['StrengthSource'];

    if (!id || !name) {
      issues.push({ row: excelRow, code: id || undefined, message: '코드 또는 이름이 비어 있습니다.' });
      return;
    }
    if (![length, width, height, weightKg, quantity].every(Number.isFinite)) {
      issues.push({ row: excelRow, code: id, message: '치수·중량·수량 중 숫자가 아닌 값이 있습니다.' });
      return;
    }
    if (length <= 0 || width <= 0 || height <= 0 || weightKg <= 0) {
      issues.push({ row: excelRow, code: id, message: '치수와 박스 중량은 0보다 커야 합니다.' });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      issues.push({ row: excelRow, code: id, message: '수량은 0 이상의 정수여야 합니다. 0은 비활성 SKU로 유지됩니다.' });
      return;
    }
    if (!isBlank(stackValue) && (!Number.isFinite(maxStackLayers) || !Number.isInteger(maxStackLayers) || maxStackLayers < 1)) {
      issues.push({ row: excelRow, code: id, message: '최대 적층단은 비워두거나 1 이상의 정수여야 합니다.' });
      return;
    }
    if (!isBlank(topLoadValue) && (!Number.isFinite(maxTopLoadKg) || maxTopLoadKg < 0)) {
      issues.push({ row: excelRow, code: id, message: '상부 허용하중은 비워두거나 0 이상의 숫자여야 합니다.' });
      return;
    }
    if (!isBlank(unloadValue) && (!Number.isFinite(unloadPriority) || !Number.isInteger(unloadPriority) || unloadPriority < 1)) {
      issues.push({ row: excelRow, code: id, message: '하역순서는 비워두거나 1 이상의 정수여야 합니다.' });
      return;
    }
    if (!rotation.valid) {
      issues.push({ row: excelRow, code: id, message: '90도회전허용 값은 Y/N, 허용/금지, TRUE/FALSE, 1/0 중 하나여야 합니다.' });
      return;
    }
    if (!material.valid) {
      issues.push({ row: excelRow, code: id, message: `재질은 비워두거나 ${CARTON_MATERIAL_ORDER.map(key => CARTON_MATERIALS[key].label).join(', ')} 중 하나여야 합니다.` });
      return;
    }

    if (!firstRowById.has(id)) firstRowById.set(id, excelRow);
    rawItems.push({
      id,
      name,
      length,
      width,
      height,
      weightKg,
      quantity,
      ...(defaultQuantity == null || stackValue !== undefined ? { maxStackLayers: Number.isFinite(maxStackLayers) ? maxStackLayers : undefined } : {}),
      ...(defaultQuantity == null || topLoadValue !== undefined ? { maxTopLoadKg: Number.isFinite(maxTopLoadKg) ? maxTopLoadKg : undefined } : {}),
      ...(defaultQuantity != null && topLoadValue !== undefined ? { topLoadLimitExplicit: true, strengthUnverified: isBlank(topLoadValue) } : {}),
      ...(defaultQuantity == null || rotationValue !== undefined ? { allowRotation: rotation.value } : {}),
      ...(defaultQuantity == null || unloadValue !== undefined ? { unloadPriority: Number.isFinite(unloadPriority) ? unloadPriority : undefined } : {}),
      // Absent columns keep the registered value on catalog merge; a blank cell clears it.
      ...(materialValue !== undefined ? { cartonMaterial: material.value } : {}),
      ...(sourceValue !== undefined || topLoadValue !== undefined
        ? { strengthSource: String(sourceValue ?? '').trim() === MATERIAL_ESTIMATE_LABEL && !isBlank(topLoadValue) ? 'material-estimate' as const : undefined } : {}),
    });
  });

  if (defaultQuantity != null) {
    // Catalog rows update master data: duplicate IDs must never silently sum or choose a row.
    const counts = new Map<string, number>();
    for (const row of rows) {
      const id = String(row['코드'] ?? row['Code'] ?? row['ID'] ?? '').trim();
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count > 1) issues.push({ row: firstRowById.get(id) ?? 2, code: id, message: `중복 박스코드 ${id}: 같은 코드는 한 행만 남겨 주세요.` });
    }
    return { items: rawItems.filter(item => counts.get(item.id) === 1), issues, totalRows: rows.length };
  }

  return {
    items: mergeWorkbookDuplicates(rawItems, firstRowById, issues),
    issues,
    totalRows: rows.length,
  };
}

export function downloadCargoTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ['BOX-A', 'BOX A', 0.6, 0.4, 0.35, 18, 70, 7, 100, 'Y', 2],
    ['BOX-B', 'BOX B', 0.5, 0.35, 0.3, 12, 55, 7, 80, 'N', 1],
  ]);
  worksheet['!cols'] = [12, 18, 12, 12, 12, 12, 10, 14, 20, 16, 12].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cargo');
  XLSX.writeFile(workbook, 'container-loading-cargo-template.xlsx');
}

export function createBoxCatalogTemplate(): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['코드', '이름', '길이(m)', '폭(m)', '높이(m)', '중량(kg)', '최대적층단', '상부허용중량(kg)', '90도회전허용', '재질'],
    ['BOX-A', 'BOX A', 0.6, 0.4, 0.35, 18, 7, 100, 'Y', CARTON_MATERIALS['double-wall'].label],
    ['BOX-B', 'BOX B', 0.5, 0.35, 0.3, 12, 7, 80, 'N', ''],
  ]);
  worksheet['!cols'] = [12, 18, 12, 12, 12, 12, 14, 20, 16, 18].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Boxes');
  return workbook;
}

export function downloadBoxCatalogTemplate() {
  XLSX.writeFile(createBoxCatalogTemplate(), 'container-loading-box-template.xlsx');
}

/** Editable master-data export, independent of the current search/selected loading quantities. */
export function createBoxCatalogWorkbook(items: readonly CargoItem[]): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['코드', '이름', '길이(m)', '폭(m)', '높이(m)', '중량(kg)', '수량', '최대적층단', '상부 허용하중(kg)', '90도회전허용', '하역순서', '재질', '상부허용하중 출처'],
    ...items.map(item => [item.id, item.name, item.length, item.width, item.height, item.weightKg,
      item.quantity, item.maxStackLayers ?? '', item.strengthUnverified ? '' : item.maxTopLoadKg ?? '', item.allowRotation === false ? 'N' : 'Y', item.unloadPriority ?? '',
      item.cartonMaterial ? CARTON_MATERIALS[item.cartonMaterial].label : '',
      !item.strengthUnverified && item.maxTopLoadKg != null && item.strengthSource === 'material-estimate' ? MATERIAL_ESTIMATE_LABEL : '']),
  ]);
  worksheet['!cols'] = [25, 44, 13, 13, 13, 13, 12, 16, 24, 18, 14, 18, 18].map(wch => ({ wch }));
  worksheet['!autofilter'] = { ref: `A1:M${items.length + 1}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Boxes');
  const guide = XLSX.utils.aoa_to_sheet([
    ['항목', '수정 및 업로드 안내'],
    ['등록 목록 전체', '검색·선택 여부와 관계없이 현재 로그인 사용자의 전체 박스 목록입니다.'],
    ['코드', '기존 코드를 유지하면 해당 박스를 갱신합니다. 새 코드는 신규 박스로 추가됩니다. 중복 코드는 반영하지 않습니다.'],
    ['치수 / 중량', '치수는 m, 중량은 kg입니다. 수량은 기본수량이며 이번 적재 선택 수량과 다릅니다.'],
    ['상부 허용하중(kg)', '위에 놓이는 화물의 누적 허용중량입니다. 0은 상부 적재 금지, 빈칸은 강도 미확인이며 계산 시 1단·상부하중 0kg로 제한합니다. 파렛트 허용중량과 다릅니다.'],
    ['최대적층단', '1 이상의 정수 또는 빈칸(별도 제한 없음)을 입력하세요.'],
    ['재질', `${CARTON_MATERIAL_ORDER.map(key => CARTON_MATERIALS[key].label).join(', ')} 중 하나 또는 빈칸. 재질만으로는 상부 허용하중이 바뀌지 않습니다.`],
    ['상부허용하중 출처', `'${MATERIAL_ESTIMATE_LABEL}'이면 상부 허용하중이 재질 추정값(시험값 아님)이라는 표시입니다. 실측·제조사 값으로 바꾸면 이 칸을 비우세요.`],
    ['재업로드', 'Boxes 시트를 첫 번째로 유지하고 수정한 엑셀 업로드를 사용하세요. 삭제한 행은 기존 목록에서 삭제되지 않습니다.'],
    ['기존 정보', '이 양식에 없는 취급 제한·색상 등은 같은 코드로 업로드할 때 기존 등록값을 유지합니다. 전체 백업 파일은 아닙니다.'],
    ['오류 / 재계산', '오류 행은 제외하고 정상 행만 반영합니다. 직전 변경 되돌리기가 가능합니다. 수정 후 포장 확정과 자동 적재를 다시 실행하세요.'],
  ]);
  guide['!cols'] = [{ wch: 25 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, guide, '수정 안내');
  return workbook;
}

export function downloadBoxCatalog(items: readonly CargoItem[]) {
  XLSX.writeFile(createBoxCatalogWorkbook(items), `registered-boxes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
