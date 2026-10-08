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
    expect(parsed.items).toEqual(items.map(item => ({ ...item, topLoadLimitExplicit: true, strengthUnverified: item.maxTopLoadKg == null })));
  });

  it('imports edited limits without using the old workbook values', async () => {
    const workbook = createBoxCatalogWorkbook([box]);
    workbook.Sheets.Boxes.H2 = { t: 'n', v: 6 };
    workbook.Sheets.Boxes.I2 = { t: 'n', v: 45.5 };
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.issues).toEqual([]);
    expect(result.items[0]).toMatchObject({ id: '001', maxStackLayers: 6, maxTopLoadKg: 45.5, topLoadLimitExplicit: true });
  });

  it('does not turn an unverified operational zero into an explicitly verified zero on round trip', async () => {
    const workbook = createBoxCatalogWorkbook([{ ...box, strengthUnverified: true }]);
    expect(workbook.Sheets.Boxes.I2.v).toBe('');
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.items[0]).toMatchObject({ strengthUnverified: true });
    expect(result.items[0].maxTopLoadKg).toBeUndefined();
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

  it('round-trips the carton material and a material-estimated top load', async () => {
    const items: CargoItem[] = [
      { ...box, id: 'M1', cartonMaterial: 'b-flute', maxTopLoadKg: 32.3, strengthSource: 'material-estimate' },
      { ...box, id: 'M2', cartonMaterial: 'wood', maxTopLoadKg: 250 },
      { ...box, id: 'M3', cartonMaterial: undefined },
    ];
    const workbook = createBoxCatalogWorkbook(items);
    expect(workbook.Sheets.Boxes.L1.v).toBe('재질');
    expect(workbook.Sheets.Boxes.M1.v).toBe('상부허용하중 출처');
    expect(workbook.Sheets.Boxes.L2.v).toBe('B골 단면');
    expect(workbook.Sheets.Boxes.M2.v).toBe('재질 추정');
    expect(workbook.Sheets.Boxes.M3.v).toBe('');
    const parsed = await parseBoxCatalogWorkbook(file(workbook));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items.map(item => [item.id, item.cartonMaterial, item.maxTopLoadKg, item.strengthSource])).toEqual([
      ['M1', 'b-flute', 32.3, 'material-estimate'], ['M2', 'wood', 250, undefined], ['M3', undefined, 0, undefined],
    ]);
  });

  it('accepts the internal key, rejects an unknown material and drops the estimate mark without a value', async () => {
    const workbook = createBoxCatalogWorkbook([box, { ...box, id: '002' }, { ...box, id: '003' }]);
    workbook.Sheets.Boxes.L2 = { t: 's', v: 'double-wall' };
    workbook.Sheets.Boxes.L3 = { t: 's', v: '골판지' };
    workbook.Sheets.Boxes.I4 = { t: 's', v: '' };
    workbook.Sheets.Boxes.M4 = { t: 's', v: '재질 추정' };
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect(result.items.find(item => item.id === '001')?.cartonMaterial).toBe('double-wall');
    expect(result.items.some(item => item.id === '002')).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: '002' });
    expect(result.issues[0].message).toContain('재질');
    expect(result.items.find(item => item.id === '003')).toMatchObject({ strengthUnverified: true, strengthSource: undefined });
  });

  it('keeps a registered material when an older file has no material column', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['코드', '이름', '길이(m)', '폭(m)', '높이(m)', '중량(kg)'],
      ['001', '수정 이름', .235, .31, .265, 7.8],
    ]), 'Boxes');
    const result = await parseBoxCatalogWorkbook(file(workbook));
    expect('cartonMaterial' in result.items[0]).toBe(false);
    expect({ ...box, cartonMaterial: 'ac-flute' as const, ...result.items[0] }.cartonMaterial).toBe('ac-flute');
  });

});
