import { afterEach, describe, expect, it } from 'vitest';
import { planningContainer, validatePlacements } from './constraints';
import { buildPalletPackaging } from './mixedModePacking';
import { validateOperationalLoading } from './operationalValidator';
import { BALANCED_PALLET_LAYER_PROFILE, buildBalancedPalletLoads } from './palletBalancedLayers';
import { centerPalletPlan } from './palletCentering';
import { packOnPallets, type OptimizedPalletPackingResult } from './palletOptimization';
import { defaultPalletSpec, palletTopLayerFill, type PalletLoad, type PalletSpec } from './palletPacking';
import { palletSupportBodies } from './palletPlanValidation';
import { palletTipUtilization, palletTipViolations } from './palletTransportStability';
import { supportContactArea } from './support';
import { physicsTargetFromPalletSnapshot } from '../certifiedExport';
import { runInertiaCertification } from '../inertiaCertification';
import { resetPhysicsWorkerPool } from '../physicsWorkerPool';
import type { CargoItem, ContainerSpec } from './types';

// Owner rule 2026-11-20, "파렛트를 더 적게 사용해야 한다" (AGENTS.md 2J, LOADING_RULES 7D).

const carton = (id: string, length: number, width: number, height: number, weightKg: number, quantity: number, maxTopLoadKg: number): CargoItem => ({
  id, name: id, length, width, height, weightKg, quantity, maxTopLoadKg, allowRotation: true, strengthUnverified: false, topLoadLimitExplicit: true,
});

/** The cargo of the owner's check file `loading-system-check-20261120-1107`: 2,684 cartons, 7,809.8 kg. */
const ownerContainer: ContainerSpec = {
  length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3,
  unloadingPolicy: 'strict', palletDestination: { transport: 'domestic', region: 'europe', requiredSize: '1100x1100' }, ceilingClearanceM: 0.05,
};
const ownerCargo: CargoItem[] = [
  carton('PKG-PRD-003', 0.23500000000000001, 0.13, 0.265, 22.000000000000004, 93, 34.3),
  carton('PKG-PRD-003-PARTIAL', 0.23500000000000001, 0.13, 0.265, 10.200000000000003, 1, 34.3),
  carton('PKG-PRD-014', 0.26, 0.24, 0.225, 22.000000000000004, 93, 40.2),
  carton('PKG-PRD-014-PARTIAL', 0.26, 0.24, 0.225, 10.200000000000003, 1, 40.2),
  carton('PKG-PRD-050', 0.23500000000000001, 0.31, 0.265, 4.2, 55, 42),
  carton('PKG-PRD-050-PARTIAL', 0.23500000000000001, 0.31, 0.265, 2.4000000000000004, 1, 42),
  carton('PKG-GST-002', 0.23500000000000001, 0.13, 0.265, 1.42, 2439, 34.3),
  carton('PKG-GST-002-PARTIAL', 0.23500000000000001, 0.13, 0.265, 0.6199999999999999, 1, 34.3),
];
const ownerSpec: PalletSpec = {
  minTopLayerFillRatio: 0.5, length: 1.1, width: 1.1, height: 0.12, tareWeightKg: 6, maxLoadKg: 1000, maxStackLevels: 2,
  maxSupportedTopWeightKg: 1000, useCornerGuards: false, cornerGuardWeightKg: 2, cornerGuardExtraHeightM: 0.03, useWrapping: false,
  wrappingWeightKg: 1.5, wrappingExtraHeightM: 0.01, minimizePackaging: true, material: 'plastic', maxStaticLoadKg: 1000,
};

const cargoHeight = (load: PalletLoad) => Math.max(...load.cargoPlacements.map(p => p.z + p.height)) - load.z - load.height;
const errors = (container: ContainerSpec, cargo: CargoItem[], plan: OptimizedPalletPackingResult) => {
  const centered = centerPalletPlan(plan, container);
  return [...validatePlacements(container, centered.placements).map(issue => issue.type),
    ...validateOperationalLoading(container, cargo, centered.placements, palletSupportBodies(centered)).filter(f => f.severity === 'error').map(f => f.code)];
};

afterEach(() => resetPhysicsWorkerPool());

describe('owner cargo of 2026-11-20: 2,684 cartons on 1100×1100 pallets', () => {
  let cached: { plan: OptimizedPalletPackingResult; before: unknown } | undefined;
  const planned = () => {
    if (!cached) {
      const before = structuredClone({ ownerContainer, ownerCargo, ownerSpec });
      cached = { plan: packOnPallets(ownerContainer, ownerCargo, ownerSpec, 'stability'), before };
    }
    return cached;
  };

  it('carries every carton on 10 pallets instead of 17', () => {
    const { plan, before } = planned();
    expect(plan.palletCount).toBe(10);
    expect(plan.pallets.every(load => load.stackLevel === 1)).toBe(true);
    expect(plan.remaining).toEqual([]);
    expect(plan.placements).toHaveLength(2684);
    for (const item of ownerCargo) expect(plan.placements.filter(p => p.cargoId === item.id)).toHaveLength(item.quantity);
    expect(plan.loadedCargoWeightKg).toBeCloseTo(7809.8, 6);
    expect({ ownerContainer, ownerCargo, ownerSpec }).toEqual(before);
  }, 120_000);

  it('keeps every unit inside the pallet load, the ceiling, the deck, the tipping limit and the top-tier rule', () => {
    const { plan } = planned();
    const centered = centerPalletPlan(plan, ownerContainer);
    expect(palletTipViolations(centered.pallets, ownerSpec)).toEqual([]);
    for (const load of centered.pallets) {
      expect(load.cargoWeightKg).toBeLessThanOrEqual(ownerSpec.maxLoadKg + 1e-9);
      expect(load.height + cargoHeight(load) + load.packagingExtraHeightM).toBeLessThanOrEqual(ownerContainer.height - 0.05 + 1e-9);
      expect(palletTipUtilization(load, centered.pallets)).toBeLessThanOrEqual(1);
      if (!load.isMixedTail) expect(palletTopLayerFill(load)).toBeGreaterThanOrEqual(0.5 - 1e-9);
      for (const p of load.cargoPlacements) {
        expect(p.x).toBeGreaterThanOrEqual(load.x - 1e-6); expect(p.x + p.length).toBeLessThanOrEqual(load.x + load.length + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(load.y - 1e-6); expect(p.y + p.width).toBeLessThanOrEqual(load.y + load.width + 1e-6);
      }
    }
    // One mixed tail for the one stop, and it stands last.
    expect(plan.pallets.filter(load => load.isMixedTail)).toHaveLength(1);
    expect(plan.pallets.at(-1)!.isMixedTail).toBe(true);
    expect(errors(ownerContainer, ownerCargo, plan)).toEqual([]);
  }, 120_000);

  it('puts the 22 kg cartons on the deck of the pallets and the light cartons above them', () => {
    const { plan } = planned();
    const weight = new Map(ownerCargo.map(item => [item.id, item.weightKg]));
    for (const load of plan.pallets) {
      const deck = load.z + load.height;
      for (const p of load.cargoPlacements) if (p.weightKg > 20) expect(Math.abs(p.z - deck)).toBeLessThan(1e-9);
      // Every unit has heavy cartons below: its centre of gravity is under half its height.
      expect(load.centerOfGravity.z - load.z).toBeLessThan((load.height + cargoHeight(load)) / 2);
      // A carton rests on an equal or heavier one. The exception is the closing layer of the
      // larger 4.2 kg cartons across the flat top, used because it saves the eleventh pallet.
      for (const upper of load.cargoPlacements) for (const lower of load.cargoPlacements) {
        if (supportContactArea(lower, upper) <= 0 || upper.weightKg <= lower.weightKg + 1e-9) continue;
        expect(upper.cargoId.startsWith('PKG-PRD-050')).toBe(true);
        expect(weight.get(upper.cargoId)).toBeLessThanOrEqual(4.2);
      }
    }
    const heavyPerPallet = plan.pallets.map(load => load.cargoPlacements.filter(p => p.weightKg > 20).length);
    expect(heavyPerPallet.every(count => count >= 13 && count <= 24)).toBe(true);
  }, 120_000);

  it('passes the unchanged inertia certification, which the 17-pallet plan failed on braking', async () => {
    // The 17-pallet plan carried fourteen 22 kg cartons on top of six tiers of light cartons
    // on one pallet (tipping ratio 1.32) and failed braking at 27.7 mm with full securing.
    const result = centerPalletPlan(planned().plan, ownerContainer);
    const target = physicsTargetFromPalletSnapshot(ownerContainer, ownerCargo, { spec: ownerSpec, result });
    expect(target.result.validationIssues).toEqual([]);
    const certification = await runInertiaCertification(target);
    expect(certification.status).toBe('passed');
    expect(certification.failedScenarios).toEqual([]);
    expect(certification.passedScenarios).toBe(3);
    expect(certification.maxHorizontalShiftM).toBeLessThanOrEqual(.012);
    expect(certification.maxTiltDeg).toBeLessThanOrEqual(1.8);
    expect(certification.physicsValidation?.unstableCount).toBe(0);
    expect(certification.physicsValidation?.settled).toBe(true);
  }, 300_000);

  it('builds the same loads every time and within its fixed pass count', () => {
    const container = planningContainer(ownerContainer);
    const cargo = ownerCargo.map(item => ({ ...item, unloadPriority: 1, maxStackLayers: Math.floor((container.height - ownerSpec.height) / item.height) }));
    const first = buildBalancedPalletLoads(container, cargo, ownerSpec, 'unloading', 16, true);
    const second = buildBalancedPalletLoads(container, cargo, ownerSpec, 'unloading', 16, true);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toHaveLength(10);
    // Heavy stays low without exception costs one pallet more for this cargo.
    expect(buildBalancedPalletLoads(container, cargo, ownerSpec, 'unloading', 16, false)).toHaveLength(11);
    // It gives up instead of leaving cargo behind when the pallets allowed are too few.
    expect(buildBalancedPalletLoads(container, cargo, ownerSpec, 'unloading', 9, true)).toBeNull();
    expect(BALANCED_PALLET_LAYER_PROFILE.feedbackPasses).toBe(3);
  }, 60_000);
});

describe('a load that can be checked by hand', () => {
  // Twelve 50 kg cartons and sixty 5 kg cartons of one size, four to a layer, on pallets
  // that carry 300 kg: 900 kg, so three pallets at the least. Three hold it when each takes
  // four heavy cartons as its lowest layer and twenty light ones above (200 kg + 100 kg,
  // six layers, 1.5 m). Filled one cargo at a time the heavy cartons use up two pallets by
  // weight (six each) and the light ones need two more.
  const container: ContainerSpec = { length: 6, width: 2.35, height: 2.7, maxPayloadKg: 20000 };
  const spec: PalletSpec = { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.12, tareWeightKg: 10, maxLoadKg: 300, maxStackLevels: 1 };
  const heavy = { ...carton('HEAVY', 0.55, 0.55, 0.25, 50, 12, 60), allowRotation: false };
  const light = { ...carton('LIGHT', 0.55, 0.55, 0.25, 5, 60, 60), allowRotation: false };
  const cargo = [heavy, light];

  it('shares the heavy cartons between the pallets and saves the fourth pallet', () => {
    const before = structuredClone({ container, cargo, spec });
    const ordinary = packOnPallets(container, cargo, spec, 'capacity', { balancedLayers: false });
    const plan = packOnPallets(container, cargo, spec, 'capacity');
    expect(ordinary.placements).toHaveLength(72);
    expect(ordinary.palletCount).toBe(4);
    expect(plan.placements).toHaveLength(72);
    expect(plan.remaining).toEqual([]);
    expect(plan.palletCount).toBe(3);
    for (const load of plan.pallets) {
      const deck = load.z + load.height;
      expect(load.cargoPlacements.filter(p => p.cargoId === 'HEAVY')).toHaveLength(4);
      expect(load.cargoPlacements.filter(p => p.cargoId === 'LIGHT')).toHaveLength(20);
      expect(load.cargoPlacements.filter(p => p.cargoId === 'HEAVY').every(p => Math.abs(p.z - deck) < 1e-9)).toBe(true);
      expect(load.cargoWeightKg).toBeCloseTo(300, 9);
      expect(cargoHeight(load)).toBeCloseTo(1.5, 9);
      expect(palletTopLayerFill(load)).toBeCloseTo(1, 9);
    }
    expect(errors(container, cargo, plan)).toEqual([]);
    expect(palletTipViolations(centerPalletPlan(plan, container).pallets, spec)).toEqual([]);
    expect(packOnPallets(container, cargo, spec, 'capacity')).toEqual(plan);
    expect({ container, cargo, spec }).toEqual(before);
  });

  it('keeps the carton strength limit: no light stack heavier than the carton below allows', () => {
    // A heavy carton that carries 12 kg takes two light cartons, not five.
    const weak = [{ ...heavy, maxTopLoadKg: 12 }, light];
    const plan = packOnPallets(container, weak, spec, 'capacity');
    expect(plan.placements.length + plan.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(72);
    expect(errors(container, weak, plan)).toEqual([]);
    for (const load of plan.pallets) for (const base of load.cargoPlacements.filter(p => p.cargoId === 'HEAVY')) {
      const above = load.cargoPlacements.filter(p => p !== base && p.z > base.z && Math.abs(p.x - base.x) < 1e-9 && Math.abs(p.y - base.y) < 1e-9);
      expect(above.reduce((sum, p) => sum + p.weightKg, 0)).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  it('leaves a plan alone when it cannot use fewer pallets', () => {
    const uniform = [{ ...light, quantity: 72 }];
    expect(packOnPallets(container, uniform, spec, 'capacity')).toEqual(packOnPallets(container, uniform, spec, 'capacity', { balancedLayers: false }));
  });

  it('keeps the ordinary planner for cartons it does not arrange and for the A rules', () => {
    const unverified = [heavy, { ...light, strengthUnverified: true }];
    expect(packOnPallets(container, unverified, spec, 'capacity')).toEqual(packOnPallets(container, unverified, spec, 'capacity', { balancedLayers: false }));
    expect(buildBalancedPalletLoads(container, unverified, spec, 'capacity', 10, true)).toBeNull();
    const a: ContainerSpec = { ...container, rules: { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], door: { w: 2340, h: 2585 }, tareKg: 0, source: 'synthetic' } };
    expect(packOnPallets(a, cargo, spec, 'capacity')).toEqual(packOnPallets(a, cargo, spec, 'capacity', { balancedLayers: false }));
  });

  it('does not merge unloading stops and does not change the MIXED packaging stage', () => {
    const strict: ContainerSpec = { ...container, unloadingPolicy: 'strict' };
    const stops = [{ ...heavy, unloadPriority: 1 }, { ...light, quantity: 20, unloadPriority: 1 }, { ...light, id: 'LIGHT-2', name: 'LIGHT-2', quantity: 20, unloadPriority: 2 }];
    const plan = packOnPallets(strict, stops, spec, 'capacity');
    expect(plan.placements.length + plan.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(52);
    const stopOf = new Map(stops.map(item => [item.id, item.unloadPriority]));
    for (const load of plan.pallets) expect(new Set(load.cargoPlacements.map(p => stopOf.get(p.cargoId))).size).toBe(1);
    expect(buildPalletPackaging(container, cargo, spec, 'capacity').palletCount).toBe(4);
  });
});
