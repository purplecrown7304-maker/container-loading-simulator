import { describe, expect, it } from 'vitest';
import { auditLoading } from './loadingAudit';
import type { CargoItem, Placement } from './types';
const container = { length: 4, width: 2, height: 4, maxPayloadKg: 1000 };
const item: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 10, quantity: 20 };
const box = (z = 0, patch: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x: 0, y: 0, z, length: 1, width: 1, height: 1, weightKg: 10, ...patch });
const types = (cargo: CargoItem[], placements: Placement[]) => auditLoading(container, cargo, placements).map(i => i.type);
describe('independent loading rule audit', () => {
  it('accepts a fully supported legal stack regardless of array order', () => expect(types([{ ...item, maxStackLayers: 3, maxTopLoadKg: 20 }], [box(2), box(), box(1)])).toEqual([]));
  it('detects cumulative load through all upper layers', () => expect(types([{ ...item, maxTopLoadKg: 15 }], [box(), box(1), box(2)])).toContain('TOP_LOAD'));
  it('honors the bottom SKU layer limit in mixed stacks', () => expect(types([{ ...item, maxStackLayers: 2 }, { ...item, id: 'B' }], [box(), box(1, { cargoId: 'B' }), box(2, { cargoId: 'B' })])).toContain('STACK_LIMIT'));
  it('detects floating and insufficiently supported boxes', () => { expect(types([item], [box(1)])).toContain('UNSUPPORTED'); expect(types([item], [box(), box(1, { x: 0.5 })])).toContain('UNSUPPORTED'); });
  it('rejects forbidden rotations and excess quantities', () => { expect(types([{ ...item, allowRotation: false }], [box(0, { rotated: true })])).toContain('INVALID_CARGO'); expect(types([{ ...item, quantity: 1 }], [box(), box(1)])).toContain('QUANTITY'); });
  it('detects payload from actual placements', () => expect(auditLoading({ ...container, maxPayloadKg: 15 }, [item], [box(), box(1)]).map(i => i.type)).toContain('PAYLOAD'));
  it('rejects invalid geometry and wall penetration', () => { expect(types([item], [box(0, { length: -1 })])).toContain('INVALID_CARGO'); expect(types([item], [box(0, { x: 4 })])).toContain('OUT_OF_BOUNDS'); });
});
