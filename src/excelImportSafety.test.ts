import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCargoWorkbook } from './excel';

function workbookFile(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Cargo');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], 'cargo.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const base = {
  코드: 'A', 이름: 'Alpha', '길이(m)': 0.5, '폭(m)': 0.4, '높이(m)': 0.3,
  '중량(kg)': 10, 수량: 2, 최대적층단: 4, '상부허용중량(kg)': 100,
  '90도회전허용': 'Y', 하역순서: 1,
};

describe('Excel cargo import safety', () => {
  it('preserves zero top-load as a real no-load-above constraint', async () => {
    const parsed = await parseCargoWorkbook(workbookFile([{ ...base, '상부허용중량(kg)': 0 }]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items[0]?.maxTopLoadKg).toBe(0);
  });

  it('keeps zero quantity as an inactive SKU', async () => {
    const parsed = await parseCargoWorkbook(workbookFile([{ ...base, 수량: 0 }]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items[0]?.quantity).toBe(0);
  });

  it('rejects fractional quantity instead of silently flooring it', async () => {
    const parsed = await parseCargoWorkbook(workbookFile([{ ...base, 수량: 1.5 }]));
    expect(parsed.items).toEqual([]);
    expect(parsed.issues[0]?.message).toContain('정수');
  });

  it('rejects zero-weight cargo instead of letting it bypass payload accounting', async () => {
    const parsed = await parseCargoWorkbook(workbookFile([{ ...base, '중량(kg)': 0 }]));
    expect(parsed.items).toEqual([]);
    expect(parsed.issues[0]?.message).toContain('중량');
  });

  it('rejects fractional stack and unload priorities', async () => {
    const stack = await parseCargoWorkbook(workbookFile([{ ...base, 최대적층단: 2.5 }]));
    const unload = await parseCargoWorkbook(workbookFile([{ ...base, 하역순서: 1.5 }]));
    expect(stack.items).toEqual([]);
    expect(stack.issues[0]?.message).toContain('최대 적층단');
    expect(unload.items).toEqual([]);
    expect(unload.issues[0]?.message).toContain('하역순서');
  });
});
