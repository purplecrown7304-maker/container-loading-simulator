import { describe, expect, it } from 'vitest';
import { packagingCandidates, cargoFromProductPackaging } from './productWorkflow';
import { mergePersonalBoxStackingIntoPlanner } from './enterprisePackagingPlannerStore';
import { loadContainer } from './engine/loadingEngine';
import { defaultProductPackagingOptions, optimizeProductPackaging, type BoxCatalogItem } from './engine/productPackagingOptimizer';

const container = { length: 0.235, width: 0.13, height: 2.65, maxPayloadKg: 1000 };
const box = {
  id: 'REC-235X130X265', name: '등록 박스',
  innerLength: 0.227, innerWidth: 0.122, innerHeight: 0.257,
  outerLength: 0.235, outerWidth: 0.13, outerHeight: 0.265,
  tareWeightKg: 0.6, maxGrossWeightKg: 22, maxStackLayers: 10, maxTopLoadKg: 198,
} satisfies BoxCatalogItem & { maxStackLayers: number };
// 1mm product spacing gives 84 units/carton: exactly ten full cartons.
const product = { id: 'STACK', name: '제품', length: 0.055, width: 0.03, height: 0.04, weightKg: 0.1, quantity: 840, requiresBoxPackaging: true };

describe('registered carton stacking through product packaging', () => {
  it('preserves all ten declared layers through packaging, full cartons and loading', () => {
    const assignment = packagingCandidates(container, product, [box])[0];
    expect(assignment.unitsPerBox).toBe(84);
    expect(assignment.maxStackLayers).toBe(10);
    const cargo = cargoFromProductPackaging([product], [assignment]);
    expect(cargo[0].boxId).toBe(box.id);
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.placements).toHaveLength(10);
    expect(new Set(result.placements.map(item => item.z)).size).toBe(10);
    expect(result.remaining).toEqual([]);
    expect(result.validationIssues).toEqual([]);
  });

  it('invalidates cached packaging when only the declared layer limit changes', () => {
    expect(packagingCandidates(container, product, [box])[0].maxStackLayers).toBe(10);
    expect(packagingCandidates(container, product, [{ ...box, maxStackLayers: 2 }])[0].maxStackLayers).toBe(2);
  });

  it('honors the declared layers in the detailed planner as well', () => {
    const result = optimizeProductPackaging(container, [product], [box], { ...defaultProductPackagingOptions, allowCustomBoxDesign: false });
    expect(result.assignments[0].maxStackLayers).toBe(10);
  });

  it('keeps ceiling, positive top-load and explicit no-stacking constraints', () => {
    expect(packagingCandidates({ ...container, height: 2.395 }, product, [box])[0].maxStackLayers).toBe(9);
    expect(packagingCandidates(container, product, [{ ...box, maxTopLoadKg: 15 }])[0].maxStackLayers).toBe(2);
    expect(packagingCandidates(container, product, [{ ...box, maxTopLoadKg: 0 }])[0].maxStackLayers).toBe(1);
  });

  it('uses the registered personal declaration for a legacy recommendation and its partial carton', () => {
    const state = mergePersonalBoxStackingIntoPlanner({ container, products: [product], boxes: [{ ...box, maxTopLoadKg: 0 }] }, [{
      id: box.id, name: box.name, length: box.outerLength, width: box.outerWidth, height: box.outerHeight,
      weightKg: 22, quantity: 0, maxStackLayers: 10, maxTopLoadKg: 0,
      catalogOrigin: 'recommendation', recommendationRegistration: 'explicit',
    }]);
    const partialProduct = { ...product, quantity: 841 };
    const assignment = packagingCandidates(container, partialProduct, state.boxes)[0];
    const cargo = cargoFromProductPackaging([partialProduct], [assignment]);
    expect(cargo).toHaveLength(2);
    expect(cargo.every(item => item.maxStackLayers === 10 && item.boxId === box.id)).toBe(true);
  });
});


describe('unverified recommendation through packaging and loading', () => {
  it('keeps raw missing strength separate while full and partial cartons stay one layer', () => {
    const unknown = { ...box, strengthUnverified: true, maxTopLoadKg: undefined };
    const selected = { ...product, quantity: 841 };
    const assignment = packagingCandidates(container, selected, [unknown])[0];
    expect(assignment).toMatchObject({ maxStackLayers: 1, maxTopLoadKg: 0, strengthUnverified: true, strengthStatus: 'design-target' });
    const cargo = cargoFromProductPackaging([selected], [assignment]);
    expect(cargo).toHaveLength(2);
    expect(cargo.every(item => item.maxStackLayers === 1 && item.maxTopLoadKg === 0 && item.strengthUnverified)).toBe(true);
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.placements.every(item => item.z === 0)).toBe(true);
    expect(result.placements.length + result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(cargo.reduce((sum, item) => sum + item.quantity, 0));
    expect(unknown.maxTopLoadKg).toBeUndefined();
    const detailed = optimizeProductPackaging(container, [selected], [unknown], { ...defaultProductPackagingOptions, allowCustomBoxDesign: false });
    expect(detailed.assignments[0]).toMatchObject({ maxStackLayers: 1, maxTopLoadKg: 0, strengthUnverified: true });
  });
  it('requires explicit finite compression before releasing an unverified recommendation', () => {
    const unknown = { ...box, strengthUnverified: true, maxTopLoadKg: undefined };
    const personal = { id: box.id, name: box.name, length: box.outerLength, width: box.outerWidth, height: box.outerHeight, weightKg: 22, quantity: 0, maxStackLayers: 10, strengthUnverified: true, topLoadLimitExplicit: true };
    const initial = { container, products: [product], boxes: [unknown] };
    const blank = mergePersonalBoxStackingIntoPlanner(initial, [personal]);
    expect(blank.boxes[0].maxTopLoadKg).toBeUndefined();
    expect(packagingCandidates(container, product, blank.boxes)[0].maxStackLayers).toBe(1);
    const zero = mergePersonalBoxStackingIntoPlanner(initial, [{ ...personal, maxTopLoadKg: 0 }]);
    expect(zero.boxes[0].strengthUnverified).toBe(false);
    expect(packagingCandidates(container, product, zero.boxes)[0].maxStackLayers).toBe(1);
    const confirmed = mergePersonalBoxStackingIntoPlanner(initial, [{ ...personal, maxTopLoadKg: 45 }]);
    expect(confirmed.boxes[0]).toMatchObject({ maxTopLoadKg: 45, strengthUnverified: false });
    expect(packagingCandidates(container, product, confirmed.boxes)[0].maxStackLayers).toBeGreaterThan(1);
    expect(initial.boxes[0].maxTopLoadKg).toBeUndefined();
  });
});
