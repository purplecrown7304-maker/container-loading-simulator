import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createProductCatalogWorkbook, mergeProductCatalog, parseProductWorkbook } from './productExcel';
import type { CompanyProductItem } from './companyProduct';

const original: CompanyProductItem = {
  id: '00017', name: '정밀 제품', length: .2205, width: .15025, height: .100,
  weightKg: 1.2345, quantity: 17, requiresBoxPackaging: false,
  orientationPolicy: 'upright', allowRotation: false, cushioningM: .008,
  fragile: true, maxInternalLayers: 2, allowMixedCarton: false,
};
const file = (book: XLSX.WorkBook) => ({ arrayBuffer: async () => XLSX.write(book, { type: 'array', bookType: 'xlsx' }) }) as File;

describe('editable company product catalog', () => {
  it('round-trips codes, fractional millimetres, weight and packaging without exporting shipment quantities', async () => {
    const book = createProductCatalogWorkbook([original, { ...original, id: 'Y', requiresBoxPackaging: undefined }]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Products, { header: 1 });
    expect(rows[0]).not.toContain('수량');
    expect(book.Sheets.Products.A2).toMatchObject({ t: 's', v: '00017', z: '@' });
    const parsed = await parseProductWorkbook(file(book));
    expect(parsed.issues).toEqual([]);
    expect(parsed.items[0]).toMatchObject({ id: '00017', length: .2205, width: .15025, weightKg: 1.2345, requiresBoxPackaging: false });
    expect(parsed.items[1].requiresBoxPackaging).toBe(true);
  });

  it('applies edited master fields, adds new codes and keeps omitted products and packing conditions', async () => {
    const omitted = { ...original, id: 'KEEP' };
    const book = createProductCatalogWorkbook([original]);
    book.Sheets.Products.B2.v = '수정 제품';
    book.Sheets.Products.C2.v = 325.5;
    book.Sheets.Products.F2.v = 2.5;
    book.Sheets.Products.G2.v = 'Y';
    XLSX.utils.sheet_add_aoa(book.Sheets.Products, [['NEW', '추가 제품', 100, 80, 50, .2, 'N']], { origin: -1 });
    book.SheetNames.reverse();
    const parsed = await parseProductWorkbook(file(book));
    expect(parsed.issues).toEqual([]);
    const result = mergeProductCatalog([original, omitted], parsed.items);
    expect(result).toMatchObject({ added: 1, updated: 1 });
    expect(result.products).toHaveLength(3);
    expect(result.products[0]).toEqual({ ...original, name: '수정 제품', length: .3255, weightKg: 2.5, requiresBoxPackaging: true });
    expect(result.products[1]).toEqual(omitted);
    expect(original.name).toBe('정밀 제품');
  });

  it('leaves invalid existing rows unchanged and reports their actual Excel row', async () => {
    const book = createProductCatalogWorkbook([original]);
    XLSX.utils.sheet_add_aoa(book.Sheets.Products, [['BAD', '잘못된 제품', -1, 80, 50, .2, 'Y']], { origin: 'A5' });
    book.Sheets.Products.F2.v = '잘못된 중량';
    book.Sheets.Products.F2.t = 's';
    const parsed = await parseProductWorkbook(file(book));
    expect(parsed.items).toEqual([]);
    expect(parsed.issues.map(issue => issue.row)).toEqual([2, 5]);
    expect(mergeProductCatalog([original], parsed.items).products).toEqual([original]);
  });

  it('exports an empty catalog with headers and no sample products', async () => {
    const parsed = await parseProductWorkbook(file(createProductCatalogWorkbook([])));
    expect(parsed.items).toEqual([]);
    expect(parsed.totalRows).toBe(0);
  });
});
