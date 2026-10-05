import { afterEach, describe, expect, it } from 'vitest';
import { cargoFromProductPackaging, packagingCandidates } from './productWorkflow';
import { readShipmentInstructionSnapshot, writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { buildConsistencyReport } from './diagnosticBlackbox';
import { loadContainer } from './engine/loadingEngine';

const container = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };
const product = { id: 'TARE', name: '합성 자중 회귀', length: 0.1, width: 0.1, height: 0.1, weightKg: 2, quantity: 9, requiresBoxPackaging: true };
const box = { id: 'BOX', name: '자중 0.6kg', innerLength: 0.4, innerWidth: 0.3, innerHeight: 0.3, outerLength: 0.42, outerWidth: 0.32, outerHeight: 0.32, tareWeightKg: 0.6, maxGrossWeightKg: 30, maxStackLayers: 1, maxTopLoadKg: 0, strengthUnverified: true };
const assignment = { ...packagingCandidates(container, product, [box])[0], unitsPerBox: 4, boxesNeeded: 3, grossWeightKg: 8.6 };
afterEach(() => window.localStorage.clear());

describe('packaged cargo gross weight', () => {
  it('adds the same carton tare to full and partial boxes while preserving contents and unknown strength', () => {
    const cargo = cargoFromProductPackaging([product], [assignment]);
    expect(cargo).toHaveLength(2);
    expect(cargo[0]).toMatchObject({ weightKg: 8.6, contentWeightKg: 8, quantity: 2, strengthUnverified: true, maxStackLayers: 1, maxTopLoadKg: 0 });
    expect(cargo[1].weightKg).toBeCloseTo(2.6);
    expect(cargo[1]).toMatchObject({ contentWeightKg: 2, quantity: 1, strengthUnverified: true });
    expect(cargo.reduce((sum, item) => sum + item.quantity * item.weightKg, 0)).toBeCloseTo(19.8);
  });
  it('includes tare when the only carton is partial and leaves unpackaged products unchanged', () => {
    const partial = cargoFromProductPackaging([{ ...product, quantity: 1 }], [{ ...assignment, boxesNeeded: 1 }]);
    expect(partial[0].weightKg).toBeCloseTo(2.6);
    expect(partial[0].contentWeightKg).toBe(2);
    expect(cargoFromProductPackaging([{ ...product, requiresBoxPackaging: false }], [])[0].weightKg).toBe(2);
  });
  it('uses gross carton weights against payload without losing remaining demand', () => {
    const cargo = cargoFromProductPackaging([product], [assignment]);
    const result = loadContainer({ ...container, maxPayloadKg: 18 }, cargo, { strategy: 'capacity', publish: false });
    expect(result.loadedWeightKg).toBeLessThanOrEqual(18);
    expect(result.placements.length).toBeLessThan(3);
    expect(result.placements.length + result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    expect(result.placements.every(item => item.weightKg === cargo.find(input => input.id === item.cargoId)!.weightKg)).toBe(true);
  });
  it('binds the snapshot to gross weight and content metadata', () => {
    const cargo = cargoFromProductPackaging([product], [assignment]);
    writeShipmentInstructionSnapshot([product], [assignment], cargo);
    expect(readShipmentInstructionSnapshot(cargo)).not.toBeNull();
    expect(readShipmentInstructionSnapshot(cargo.map(item => ({ ...item, weightKg: item.contentWeightKg! })))).toBeNull();
    expect(readShipmentInstructionSnapshot(cargo.map(item => ({ ...item, contentWeightKg: 123 })))).toBeNull();
  });
  it('detects content-only loading weights instead of endorsing the omitted tare', () => {
    const cargo = cargoFromProductPackaging([product], [assignment]);
    writeShipmentInstructionSnapshot([product], [assignment], cargo);
    const empty = { placements: [], remaining: cargo.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: 'test' })), loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
    const valid = buildConsistencyReport(container, cargo, empty);
    const invalid = buildConsistencyReport(container, cargo.map(item => ({ ...item, weightKg: item.contentWeightKg! })), empty);
    expect(valid.checks.find(item => item.id === 'packaging-cargo-TARE')?.severity).toBe('OK');
    expect(invalid.checks.find(item => item.id === 'packaging-cargo-TARE')?.severity).toBe('CRITICAL');
  });
});
