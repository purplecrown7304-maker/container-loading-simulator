import { describe, expect, it } from 'vitest';
import { applyConfirmedPackagingIdentity } from './ConfirmedPackagingLoadingBridge';
import type { PersonalBoxCatalogItem } from './personalBoxCatalog';
import type { ShipmentInstructionSnapshot } from './shipmentInstruction';
import type { StoredState } from './storage';

const state: StoredState = {
  container: { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 },
  cargo: [{
    id: 'PKG-PRD-004',
    name: 'PRD-004PE · 범용 추천',
    length: 0.57,
    width: 0.75,
    height: 0.33,
    weightKg: 9.6,
    quantity: 416,
    maxStackLayers: 1,
    maxTopLoadKg: 0,
    productId: 'PRD-004',
    productName: 'PRD-004PE',
    unitsPerPackage: 192,
  }],
};

const snapshot: ShipmentInstructionSnapshot = {
  shipmentNo: 'SHIP-TEST',
  createdAt: '2026-09-16T00:00:00.000Z',
  cargoSignature: '',
  lines: [{
    productId: 'PRD-004',
    productName: 'PRD-004PE',
    productQuantity: 80000,
    packagingMode: 'box',
    cargoId: 'PKG-PRD-004',
    boxId: 'REC-570X750X330',
    boxName: '범용 추천 570×750×330 (강도확인)',
    unitsPerBox: 192,
    boxesNeeded: 417,
    grossWeightKg: 10.2,
    contentWeightKg: 9.6,
    partialUnits: 128,
    partialContentWeightKg: 6.4,
    outerLength: 0.57,
    outerWidth: 0.75,
    outerHeight: 0.33,
  }],
};

const personal: PersonalBoxCatalogItem = {
  id: 'REC-570X750X330',
  name: '범용 추천 570×750×330 (강도확인)',
  length: 0.57,
  width: 0.75,
  height: 0.33,
  weightKg: 22,
  quantity: 0,
  maxStackLayers: 10,
  maxTopLoadKg: 0,
  allowRotation: true,
  catalogOrigin: 'recommendation',
  recommendationRegistration: 'explicit',
};

describe('confirmed packaging loading bridge', () => {
  it('restores box tracking metadata and the personal 10-layer limit before final loading', () => {
    const confirmed = applyConfirmedPackagingIdentity(state, snapshot, [personal]);
    expect(confirmed.cargo[0].boxId).toBe('REC-570X750X330');
    expect(confirmed.cargo[0].boxName).toContain('범용 추천');
    expect(confirmed.cargo[0].maxStackLayers).toBe(10);
    expect(confirmed.cargo[0].maxTopLoadKg).toBeUndefined();
  });
});
