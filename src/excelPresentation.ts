import { CARTON_MATERIAL_ORDER, CARTON_MATERIALS } from './engine/cartonMaterial';
import { uiMessage, uiText } from './uiLanguage';

/** Presentation headers are translated; canonical keys and earlier exports remain importable. */
export const EXCEL_IMPORT_HEADERS = [
  '코드', '이름', '길이(m)', '폭(m)', '높이(m)', '중량(kg)', '수량', '최대적층단',
  '상부허용중량(kg)', '상부 허용하중(kg)', '90도회전허용', '하역순서', '재질', '상부허용하중 출처',
  '제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '박스적재필요',
  '박스당최대EA', '회전정책', '벽완충여유(mm)', '제품간격(mm)', '내부최대적층', '파손주의', '혼합포장허용',
  '박스코드', '박스명', '내부L(mm)', '내부W(mm)', '내부H(mm)', '외부L(mm)', '외부W(mm)', '외부H(mm)',
  '박스자중(kg)', '최대총중량(kg)', '박스단가',
] as const;

export function normalizeExcelHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };
  // SheetJS uses a non-enumerable row marker; preserve it through header normalization.
  if (typeof row.__rowNum__ === 'number') Object.defineProperty(normalized, '__rowNum__', { value: row.__rowNum__, enumerable: false });
  for (const header of EXCEL_IMPORT_HEADERS) {
    if (Object.hasOwn(row, header)) continue;
    for (const language of ['en', 'vi'] as const) {
      const alias = uiText(header, [], language);
      if (Object.hasOwn(row, alias)) { normalized[header] = row[alias]; break; }
    }
  }
  return normalized;
}

/** Keys only: cell values may contain user-authored Korean names and identifiers. */
export function excelDisplayRows<T extends object>(rows: readonly T[]): Record<string, unknown>[] {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [uiText(key), value])));
}

export function excelHeaders(headers: readonly string[]): string[] {
  return headers.map(header => uiText(header));
}

/** Translate known diagnostic data at the boundary, without changing canonical parser errors. */
export function excelIssueMessage(message: string): string {
  const materials = CARTON_MATERIAL_ORDER.map(key => CARTON_MATERIALS[key].label);
  if (message === `재질은 비워두거나 ${materials.join(', ')} 중 하나여야 합니다.`) {
    return uiText('재질은 비워두거나 {0} 중 하나여야 합니다.', [materials.map(label => uiText(label)).join(', ')]);
  }
  return uiMessage(message);
}
