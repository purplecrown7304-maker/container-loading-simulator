import { describe, expect, it } from 'vitest';
import { packByHeavyInnerBlocks, heavyInnerLayerLimit } from './heavyInnerBlockPacker';
import { auditLoading } from './loadingAudit';
import { heavyInnerConflictFindings, heavyInnerOrderViolations, usesHeavyInnerLoading } from './heavyInnerPolicy';
import { validateOperationalWeightAndCog } from './operationalValidator';
import { unloadingObstructions } from './operationalQuality';
import type { CargoItem, ContainerSpec } from './types';

const item = (id: string, weightKg: number, quantity: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .5, width: .5, height: .5, weightKg, quantity, maxStackLayers: 2, maxTopLoadKg: 200, ...overrides,
});
const container: ContainerSpec = { length: 4, width: 1, height: 2, maxPayloadKg: 1000 };

describe('heavy-inner continuous direct-box work blocks', () => {
  it('orders individual gross package weight, independently of SKU total or requested input order', () => {
    const cargo = [item('light', 5, 8), item('heavy', 30, 4), item('medium', 10, 6)];
    const first = packByHeavyInnerBlocks(container, cargo, 'capacity');
    expect(first).toEqual(packByHeavyInnerBlocks(container, [...cargo].reverse(), 'capacity'));
    expect(first.placements.length).toBeGreaterThan(4);
    expect(heavyInnerOrderViolations(container, cargo, first.placements, 'capacity')).toBe(0);
    expect(Math.min(...first.placements.map(p => p.x))).toBe(0);
    expect(auditLoading(container, cargo, first.placements)).toEqual([]);
    // The output itself is a usable SKU work sequence, without returning to a closed SKU.
    const runs = first.placements.map(p => p.cargoId).filter((id, index, ids) => index === 0 || id !== ids[index - 1]);
    expect(runs).toEqual(['heavy', 'medium', 'light']);
  });

  it('keeps explicit strict multi-stop unloading ahead of heavy-first and reports the conflict', () => {
    const cargo = [item('early-heavy', 30, 4, { unloadPriority: 1 }), item('late-light', 5, 4, { unloadPriority: 2 })];
    const spec = { ...container, unloadingPolicy: 'strict' as const };
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements).toHaveLength(8);
    expect(unloadingObstructions(cargo, result.placements)).toBe(0);
    expect(heavyInnerOrderViolations(spec, cargo, result.placements, 'capacity')).toBe(0);
    expect(result.placements[0].cargoId).toBe('late-light');
    expect(heavyInnerConflictFindings(spec, cargo, result.placements, 'capacity').map(f => f.code)).toEqual(['HEAVY_INNER_UNLOAD_CONFLICT']);
  });

  it('does not use total payload or lighter demand to replace an individually heavy box', () => {
    const cargo = [item('heavy', 30, 2), item('light', 5, 10)];
    const result = packByHeavyInnerBlocks({ ...container, maxPayloadKg: 65 }, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'heavy')).toHaveLength(2);
    expect(result.placements.filter(p => p.cargoId === 'light')).toHaveLength(1);
    expect(result.loadedWeightKg).toBe(65);
    expect(result.remaining[0].reasonCode).toBe('PAYLOAD_LIMIT');
  });

  it('does not shift a partial load away from the inner wall or hide unmet CG', () => {
    const cargo = [item('small', 10, 1)];
    const result = packByHeavyInnerBlocks(container, cargo, 'stability');
    expect(result.placements[0].x).toBe(0);
    expect(validateOperationalWeightAndCog(container, result.placements)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CG_LONGITUDINAL', severity: 'error' })]));
  });

  it('does not fill inner side holes with light cargo before unfinished heavier rows', () => {
    const spec = { length: 3, width: 1, height: 1, maxPayloadKg: 1000 };
    const cargo = [item('heavy-wide', 20, 6, { length: .5, width: .6, height: 1, maxStackLayers: 1, allowRotation: false }),
      item('light-narrow', 10, 6, { length: .5, width: .4, height: 1, maxStackLayers: 1, allowRotation: false })];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'heavy-wide')).toHaveLength(6);
    expect(result.placements.filter(p => p.cargoId === 'light-narrow')).toHaveLength(1);
    expect(result.placements.find(p => p.cargoId === 'light-narrow')!.x).toBe(2.5);
    expect(heavyInnerOrderViolations(spec, cargo, result.placements, 'capacity')).toBe(0);
  });

  it.each(['floor', 'top-load', 'stack'] as const)('open-front mixed top reuse never relaxes %s constraints', constraint => {
    const spec = { length: .5, width: .5, height: 1, maxPayloadKg: 1000, ...(constraint === 'floor' ? { floorLoadLimitKgPerM2: 210 } : {}) };
    const cargo = [item('heavy', 50, 1, { ...(constraint === 'top-load' ? { maxTopLoadKg: 0 } : {}), ...(constraint === 'stack' ? { maxStackLayers: 1 } : {}) }), item('light', 5, 1)];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].cargoId).toBe('heavy');
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
  });

  it('preserves pallet and alternative-rule routing', () => {
    expect(usesHeavyInnerLoading(container, [item('pallet', 100, 1, { unitKind: 'pallet' })])).toBe(false);
    expect(usesHeavyInnerLoading({ ...container, rules: { version: 'a-v1', equipmentId: 'custom', kind: 'container', access: ['rear'], source: 'test' } }, [item('box', 10, 1)])).toBe(false);
  });

  it('enforces floor, declared depth, top-load and allowed floor orientations', () => {
    const spec = { ...container, floorLoadLimitKgPerM2: 1500 };
    const dense = item('dense', 19.8, 30, { length: .235, width: .13, height: .265, maxStackLayers: 10, maxTopLoadKg: 100 });
    const medium = { ...dense, id: 'medium', weightKg: 14.6 };
    const floor = item('floor', 7.8, 10, { maxStackLayers: 1, maxTopLoadKg: 0 });
    expect(heavyInnerLayerLimit(spec, dense)).toBe(2);
    expect(heavyInnerLayerLimit(spec, medium)).toBe(3);
    const cargo = [dense, medium, floor, item('fixed', 5, 2, { allowedOrientations: ['LWH'], allowRotation: false })];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
    expect(result.placements.filter(p => p.cargoId === 'floor').every(p => p.z === 0)).toBe(true);
    expect(result.placements.filter(p => p.cargoId === 'fixed').every(p => !p.rotated)).toBe(true);
  });

  it('finds a CG-admissible continuous work plan for the reported expanded shipment without relaxing its caps', () => {
    const spec: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, unloadingPolicy: 'strict' };
    const common = { length: .235, width: .13, height: .265, maxStackLayers: 10, maxTopLoadKg: 100 };
    const cargo = [item('PRD001', 19.8, 937, common), item('PRD004', 14.6, 571, common), item('PRD005', 14.6, 14, common), item('PRD006', 14.6, 71, common),
      item('PRD001-PARTIAL', 10.2, 1, common), item('PRD030', 7.8, 138, { ...common, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
      item('PRD030-PARTIAL', 7, 1, { ...common, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
      item('PRD004-PARTIAL', 6.6, 1, common), item('PRD006-PARTIAL', 6.6, 1, common), item('PRD005-PARTIAL', 4.6, 1, common)];
    const result = packByHeavyInnerBlocks(spec, cargo, 'capacity');
    expect(result.placements.filter(p => p.cargoId === 'PRD001')).toHaveLength(937);
    expect(result.placements.filter(p => ['PRD004', 'PRD005', 'PRD006'].includes(p.cargoId))).toHaveLength(656);
    expect(result.loadedWeightKg).toBeLessThanOrEqual(28600);
    expect(heavyInnerOrderViolations(spec, cargo, result.placements, 'capacity')).toBe(0);
    expect(auditLoading(spec, cargo, result.placements)).toEqual([]);
    expect(validateOperationalWeightAndCog(spec, result.placements).filter(f => f.severity === 'error')).toEqual([]);
    expect(unloadingObstructions(cargo, result.placements)).toBe(0);
    expect(result.placements.filter(p => p.cargoId.startsWith('PRD030')).every(p => p.z === 0)).toBe(true);
  });
});
