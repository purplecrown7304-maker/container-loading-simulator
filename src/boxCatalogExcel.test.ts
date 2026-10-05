import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createBoxCatalogWorkbook, parseBoxCatalogWorkbook } from './excel';
import type { CargoItem } from './engine/types';

const box: CargoItem = { id: '001', name: '=시험 박스', length: .235, width: .31, height: .265, weightKg: 7.8, quantity: 0, maxStackLayers: 10, maxTopLoadKg: 0, allowRotation: false, unloadPriority: 2 };
function file(workbook: XLSX.WorkBook): File {
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { arrayBuffer: async () => bytes } as File;
}

describe('editable registered box workbook', () => {
  it('round-trips every row, numeric precision, text codes, explicit zero and blanks', async () => {
    const items = [box, { ...box, id: '002', quantity: 42, maxStackLayers: undefined, maxTopLoadKg: undefined, unloadPriority: undefined }];
    const workbook = createBoxCatalogWorkbook(items);
    expect(workbook.Sheets.Boxes.A2.t).toBe('s');
    expect(workbook.Sheets.Boxes.B2.f).toBeUndefined();
    expect(workbook.Sheets.Boxes.I2.v).toBe(0);
    expect(workbook.Sheets.Boxes.I3.v).toBe('');
    const parsed = await parseBoxCatalogWorkbook(file(workbook));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items).toEqual(items.map(item => ({ ...item, topLoadLimitExplicit: true })));
  });

  it('imports edited limits without using the old workbook values', async () => {
    const workbook = createBoxCatalogWorkbook([box]);
    workbook.Sheets.Boxes.H2 = { t: 'n', v: 6 };
    workbook.Sheets.Boxes.I2 = { t: 'n', v: 45.5 };
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.issues).toEqual([]);
    expect(result.items[0]).toMatchObject({ id: '001', maxStackLayers: 6, maxTopLoadKg: 45.5, topLoadLimitExplicit: true });
  });

  it('omits absent optional columns so a partial upload can preserve registered restrictions', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['코드', '이름', '길이(m)', '폭(m)', '높이(m)', '중량(kg)'],
      ['001', '수정 이름', .235, .31, .265, 7.8],
    ]), 'Boxes');
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.issues).toEqual([]);
    const merged = { ...box, ...result.items[0] };
    expect(merged).toMatchObject({ name: '수정 이름', allowRotation: false, maxTopLoadKg: 0, maxStackLayers: 10, unloadPriority: 2 });
  });

  it.each(['80kg', 'Infinity', '-1'])('rejects invalid top load %s instead of clearing the limit', async value => {
    const workbook = createBoxCatalogWorkbook([box]);
    workbook.Sheets.Boxes.I2 = { t: 's', v: value };
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.items).toEqual([]);
    expect(result.issues[0].message).toContain('상부 허용하중');
  });

  it('rejects non-numeric layers and duplicate catalog codes even with zero quantity', async () => {
    const duplicate = await parseBoxCatalogWorkbook(file(createBoxCatalogWorkbook([box, { ...box, maxTopLoadKg: 100 }])));
    expect(duplicate.items).toEqual([]);
    expect(duplicate.issues[0].message).toContain('중복');
    const workbook = createBoxCatalogWorkbook([box]);
    workbook.Sheets.Boxes.H2 = { t: 's', v: '10단' };
    const invalid = await parseBoxCatalogWorkbook(file(workbook));
    expect(invalid.items).toEqual([]);
    expect(invalid.issues[0].message).toContain('적층단');
  });
});
