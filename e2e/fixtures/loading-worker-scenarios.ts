import type { CargoItem, ContainerSpec } from '../../src/engine/types';

/** Owner-approved quantities from loadingRulesApprovedRegression.test.ts. */
export const fortyFootContainer: ContainerSpec = {
  length: 12.032,
  width: 2.35,
  height: 2.7,
  maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500,
};

export const carton = (id: string, weightKg: number, quantity: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .6, width: .4, height: .4,
  weightKg, quantity, maxStackLayers: 10, maxTopLoadKg: 100000,
  ...overrides,
});

export const approvedFortyFootScenarios: Array<{
  name: string;
  container: ContainerSpec;
  cargo: CargoItem[];
  loaded: number;
  waiting: number;
  cgErrors: number;
  includeCgAlternative?: boolean;
}> = [
  { name: '700 identical cartons retain 660', container: fortyFootContainer, cargo: [carton('A', 20, 700)], loaded: 660, waiting: 40, cgErrors: 0 },
  { name: '450 cartons across three strict stops', container: { ...fortyFootContainer, unloadingPolicy: 'strict' },
    cargo: [carton('S1', 20, 150, { unloadPriority: 1 }), carton('S2', 20, 150, { unloadPriority: 2 }), carton('S3', 20, 150, { unloadPriority: 3 })], loaded: 450, waiting: 0, cgErrors: 0 },
  { name: '600 mixed-weight cartons', container: fortyFootContainer,
    cargo: [carton('H', 30, 300), carton('L', 5, 300)], loaded: 600, waiting: 0, cgErrors: 0 },
  { name: '600 mixed-weight cartons across two strict stops', container: { ...fortyFootContainer, unloadingPolicy: 'strict' },
    cargo: [carton('H', 30, 300, { unloadPriority: 1 }), carton('L', 5, 300, { unloadPriority: 2 })], loaded: 600, waiting: 0, cgErrors: 0 },
  { name: '40-carton partial load', container: fortyFootContainer, cargo: [carton('A', 20, 40)], loaded: 40, waiting: 0, cgErrors: 0 },
  { name: '800 cartons across three dimensions', container: fortyFootContainer,
    cargo: [carton('H', 30, 200), carton('M', 15, 200, { length: .5, height: .3 }), carton('L', 6, 400, { length: .4, width: .3, height: .3 })], loaded: 800, waiting: 0, cgErrors: 0 },
  { name: '630-carton CG verdict and 545-carton alternative', container: { ...fortyFootContainer, unloadingPolicy: 'strict' },
    cargo: [carton('H', 45, 330, { unloadPriority: 1 }), carton('L', 3, 300, { unloadPriority: 2 })], loaded: 630, waiting: 0, cgErrors: 1, includeCgAlternative: true },
];

/** Strict-unload versus heavy-inner conflict from heavyInnerBlockPacker.test.ts. */
export const policyContainer: ContainerSpec = { length: 4, width: 1, height: 2, maxPayloadKg: 1000 };
export const policyCargo: CargoItem[] = [
  carton('early-heavy', 30, 4, { length: .5, width: .5, height: .5, maxStackLayers: 2, maxTopLoadKg: 200, unloadPriority: 1 }),
  carton('late-light', 5, 4, { length: .5, width: .5, height: .5, maxStackLayers: 2, maxTopLoadKg: 200, unloadPriority: 2 }),
];

/** Numerical fixtures retain the original audit values from limitReview.test.ts. */
export const reviewContainer: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 1000 };
export const reviewBox: CargoItem = carton('box', 60, 2, {
  name: 'Box', length: 1, width: 1, height: .5,
  maxStackLayers: 2, maxTopLoadKg: 1000, allowRotation: false,
});

/** An actual soft-policy packed stack, rather than a fabricated validator response. */
export const afterStopCargo: CargoItem[] = [
  { ...reviewBox, id: 'EARLY', name: 'Early', quantity: 1, unloadPriority: 1 },
  { ...reviewBox, id: 'LATE', name: 'Late', quantity: 1, weightKg: 10, unloadPriority: 2 },
];

/** Large expanded shipment from heavyInnerBlockPacker.test.ts, through public loadContainer. */
const denseCarton = { length: .235, width: .13, height: .265, maxStackLayers: 10, maxTopLoadKg: 100 };
export const largeFortyFootCargo: CargoItem[] = [
  carton('PRD001', 19.8, 937, denseCarton),
  carton('PRD004', 14.6, 571, denseCarton),
  carton('PRD005', 14.6, 14, denseCarton),
  carton('PRD006', 14.6, 71, denseCarton),
  carton('PRD001-PARTIAL', 10.2, 1, denseCarton),
  carton('PRD030', 7.8, 138, { ...denseCarton, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
  carton('PRD030-PARTIAL', 7, 1, { ...denseCarton, width: .31, maxStackLayers: 1, maxTopLoadKg: 0 }),
  carton('PRD004-PARTIAL', 6.6, 1, denseCarton),
  carton('PRD006-PARTIAL', 6.6, 1, denseCarton),
  carton('PRD005-PARTIAL', 4.6, 1, denseCarton),
];
