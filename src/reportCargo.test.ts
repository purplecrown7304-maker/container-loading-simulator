import { afterEach, expect, it, vi } from 'vitest';
import { reportCargoCatalog } from './reportCargo';
import { buildShipmentInstructionSection } from './shipmentInstruction';
import * as shipment from './shipmentInstruction';
import { reportFixture } from './reportZones.fixture';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('uses product identity and the assigned family color for partial cartons', () => {
  const { cargo } = reportFixture();
  const normal = { ...cargo[0], id: 'PKG-PRODUCT', productId: 'PRODUCT', displayColor: '#2255aa' };
  const partial = { ...normal, id: 'PKG-PRODUCT-PARTIAL', displayColor: '#ee0000' };
  const catalog = reportCargoCatalog([normal, partial]);
  expect(catalog.get(normal.id)?.code).toBe('PRODUCT');
  expect(catalog.get(partial.id)).toMatchObject({ code: 'PRODUCT', color: '#2255aa', partial: true });
});

it('identifies a sole partial carton from the matching shipment even without a partial suffix', () => {
  const { cargo } = reportFixture();
  vi.spyOn(shipment, 'readShipmentInstructionSnapshot').mockReturnValue({ shipmentNo: 'TEST', createdAt: '', cargoSignature: '', lines: [{ productId: 'PRODUCT', productName: '제품', productQuantity: 3, packagingMode: 'box', cargoId: cargo[0].id, boxId: 'BOX', boxName: '상자', unitsPerBox: 10, boxesNeeded: 1, grossWeightKg: 1, partialUnits: 3, outerLength: .235, outerWidth: .13, outerHeight: .265 }] });
  expect(reportCargoCatalog(cargo).get(cargo[0].id)).toMatchObject({ code: 'PRODUCT', partial: true });
});

it('prints identical dimensions once while keeping loaded and waiting quantities separate', () => {
  const { cargo, result } = reportFixture();
  const html = buildShipmentInstructionSection(cargo, { ...result, placements: result.placements.slice(1), remaining: [{ cargoId: 'PRD-002', quantity: 1 }] });
  expect(html.match(/235 × 130 × 265 mm/g)).toHaveLength(1);
  expect(html).toContain('374 EA');
  expect(html).toContain('미적재 1');
});
