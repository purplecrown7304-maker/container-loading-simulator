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
const product = { id: 'STACK', name: '제품', length: 0.055, width: 0.03, height: 0.04, weightKg: 0.1, quantity: 960, requiresBoxPackaging: true };

describe('registered carton stacking through product packaging', () => {
  it('preserves all ten declared layers through packaging, full cartons and loading', () => {
    const assignment = packagingCandidates(container, product, [box])[0];
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
    const partialProduct = { ...product, quantity: 961 };
    const assignment = packagingCandidates(container, partialProduct, state.boxes)[0];
    const cargo = cargoFromProductPackaging([partialProduct], [assignment]);
    expect(cargo).toHaveLength(2);
    expect(cargo.every(item => item.maxStackLayers === 10 && item.boxId === box.id)).toBe(true);
  });
});
