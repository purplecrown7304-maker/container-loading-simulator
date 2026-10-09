import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseProductPackagingWorkbook } from './productPackagingExcel';
import { productGapM } from './engine/productInteriorGeometry';

const row = { '제품코드': 'P', '제품명': '제품', '길이(mm)': 30, '폭(mm)': 40, '높이(mm)': 20, '중량(kg)': .1, '수량': 168, '벽완충여유(mm)': 5 };
function workbookFile(rows: Record<string, unknown>[]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Products');
  return { arrayBuffer: async () => XLSX.write(book, { type: 'array', bookType: 'xlsx' }) } as File;
}
describe('packaging gap workbook data', () => {
  it('distinguishes wall cushioning, a fractional product gap and the default gap', async () => {
    const parsed = await parseProductPackagingWorkbook(workbookFile([{ ...row, '제품간격(mm)': .5 }, { ...row, '제품코드': 'DEFAULT' }]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.products[0]).toMatchObject({ cushioningM: .005, productGapM: .0005 });
    expect(productGapM(parsed.products[1])).toBe(.001);
  });
  it.each([-1, 'Infinity', '오류'])('rejects invalid spacing %s instead of silently applying defaults', async gap => {
    const parsed = await parseProductPackagingWorkbook(workbookFile([{ ...row, '제품간격(mm)': gap }]));
    expect(parsed.products).toEqual([]); expect(parsed.issues[0].message).toContain('제품간격');
  });
  it('does not merge rows with conflicting gap settings', async () => {
    const parsed = await parseProductPackagingWorkbook(workbookFile([{ ...row, '제품간격(mm)': 1 }, { ...row, '제품간격(mm)': 2 }]));
    expect(parsed.products).toEqual([]); expect(parsed.issues[0].message).toContain('포장조건');
  });
});
