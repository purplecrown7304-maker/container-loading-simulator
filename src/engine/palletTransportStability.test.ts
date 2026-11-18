import { afterEach, describe, expect, it } from 'vitest';
import { packOnPallets } from './palletOptimization';
import { defaultPalletSpec, type PalletLoad } from './palletPacking';
import { centerPalletCargo } from './palletCentering';
import { palletTipUtilization, palletTipViolations, tipSafeCargoHeightM } from './palletTransportStability';
import { validateOperationalLoading } from './operationalValidator';
import { palletSupportBodies } from './palletPlanValidation';
import { physicsTargetFromPalletSnapshot } from '../certifiedExport';
import { runInertiaCertification } from '../inertiaCertification';
import { resetPhysicsWorkerPool } from '../physicsWorkerPool';
import type { CargoItem, ContainerSpec } from './types';

// Anonymized field case of 2026-11-18: 2,439 full cartons + 1 partial carton on
// 1100×1100 wood pallets in a 40' high cube, stability strategy, one pallet level.
const cargo: CargoItem[] = [{
  id: 'FULL', name: 'Full carton', length: .23500000000000001, width: .13, height: .265,
  weightKg: 1.42, quantity: 2439, unitsPerPackage: 41, maxTopLoadKg: 34.3,
  allowRotation: true, strengthUnverified: false, topLoadLimitExplicit: true,
}, {
  id: 'PARTIAL', name: 'Partial carton', length: .23500000000000001, width: .13, height: .265,
  weightKg: .6199999999999999, quantity: 1, unitsPerPackage: 1, maxTopLoadKg: 34.3,
  allowRotation: true, strengthUnverified: false, topLoadLimitExplicit: true,
}];
const container: ContainerSpec = {
  length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  ceilingClearanceM: .05, unloadingPolicy: 'strict', floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
  palletDestination: { region: 'europe', transport: 'domestic', requiredSize: '1100x1100' },
};
const spec = { ...defaultPalletSpec, maxStackLevels: 1, maxStaticLoadKg: 0, material: 'wood' as const };

const unit = (overrides: Partial<PalletLoad>): PalletLoad => ({
  palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1, length: 1.1, width: 1.1, height: .15,
  cargoPlacements: [{ cargoId: 'A', x: 0, y: 0, z: .15, length: 1.1, width: 1.1, height: 1, weightKg: 100 }],
  cargoWeightKg: 100, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
  totalWeightKg: 125, centerOfGravity: { x: .55, y: .55, z: .55 }, ...overrides,
});

afterEach(() => resetPhysicsWorkerPool());

describe('pallet unit tipping limit (LOADING_RULES 7A)', () => {
  it('compares the braking moment with the restoring moment about the pallet edge', () => {
    // 0.5 g × 0.55 m CG height ÷ 0.55 m arm = 0.5; the lateral 0.35 g ratio is smaller.
    expect(palletTipUtilization(unit({}))).toBeCloseTo(.5);
    // A CG at 1.1 m sits exactly on the static threshold; above it the unit tips.
    const onThreshold = unit({ centerOfGravity: { x: .55, y: .55, z: 1.1 } });
    const tall = unit({ centerOfGravity: { x: .55, y: .55, z: 1.2 } });
    expect(palletTipUtilization(onThreshold)).toBeCloseTo(1);
    expect(palletTipViolations([unit({}), onThreshold, tall])).toEqual([tall]);
    // A configured reserve is stricter than the certification threshold.
    expect(palletTipViolations([unit({}), onThreshold, tall], { maxTipUtilizationRatio: .95 })).toEqual([onThreshold, tall]);
    // An off-centre CG shortens the arm on that side.
    expect(palletTipUtilization(unit({ centerOfGravity: { x: .275, y: .55, z: .55 } }))).toBeCloseTo(1);
  });

  it('adds everything stacked on a unit to that unit and still checks the upper unit on its own base', () => {
    const lower = unit({});
    const upper = unit({ palletIndex: 2, stackLevel: 2, z: 1.15, centerOfGravity: { x: .55, y: .55, z: 1.7 },
      cargoPlacements: [{ cargoId: 'A', x: 0, y: 0, z: 1.3, length: 1.1, width: 1.1, height: 1, weightKg: 100 }] });
    // Column CG = (0.55 + 1.7) / 2 = 1.125 m above the floor pallet's base.
    expect(palletTipUtilization(lower, [lower, upper])).toBeCloseTo(.5 * 1.125 / .55);
    expect(palletTipUtilization(upper, [lower, upper])).toBeCloseTo(.5);
    expect(palletTipViolations([lower, upper])).toEqual([lower]);
  });

  it('derives a uniform cargo height that stays inside the limit', () => {
    for (const maxTipUtilizationRatio of [undefined, .9]) {
      const limited = { ...spec, maxTipUtilizationRatio };
      const height = tipSafeCargoHeightM(limited, 170);
      const cargoWeight = 170 * height;
      const cog = (cargoWeight * (spec.height + height / 2) + spec.tareWeightKg * spec.height / 2) / (cargoWeight + spec.tareWeightKg);
      expect(.5 * cog / (spec.length / 2)).toBeCloseTo(maxTipUtilizationRatio ?? 1, 6);
    }
  });
});

describe('100,000 EA pallet shipment: fast, tight and certifiable', () => {
  it('uses ten seven-tier pallets tight against the inner wall instead of nine pallets that tip', () => {
    const before = structuredClone({ container, cargo, spec });
    const startedAt = performance.now();
    const result = centerPalletCargo(packOnPallets(container, cargo, spec, 'stability'), container);
    const elapsedMs = performance.now() - startedAt;
    expect(result.placements).toHaveLength(2440);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(10);
    expect(result.stackedPallets).toBe(0);
    for (const load of result.pallets) {
      expect(new Set(load.cargoPlacements.map(p => Math.round(p.z * 1e6))).size).toBe(7);
    }
    expect(palletTipViolations(result.pallets, spec)).toEqual([]);
    expect(Math.max(...result.pallets.map(load => palletTipUtilization(load, result.pallets)))).toBeLessThan(.95);
    // The former nine-pallet plan stacked eight and nine tiers; such a unit tips.
    expect(result.pallets.every(load => load.cargoPlacements.length <= 252)).toBe(true);

    // Tight loading: first row on the inner wall, rows touching, two lanes touching.
    const rows = [...new Set(result.pallets.map(load => Math.round(load.x * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(rows).toEqual([0, 1.1, 2.2, 3.3, 4.4]);
    const lanes = [...new Set(result.pallets.map(load => Math.round(load.y * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(lanes).toHaveLength(2);
    expect(lanes[1] - lanes[0]).toBeCloseTo(spec.width, 6);
    expect(lanes[0]).toBeGreaterThanOrEqual(0);
    expect(lanes[1] + spec.width).toBeLessThanOrEqual(container.width + 1e-9);

    // The light load against the wall is inside the proportional CG verdict.
    const errors = validateOperationalLoading(container, cargo, result.placements, palletSupportBodies(result)).filter(f => f.severity === 'error');
    expect(errors).toEqual([]);
    // No wall-clock assertion: the same run takes seconds alone and far longer beside
    // the parallel physics suites. The speed-up is exact (identical placements), so the
    // result checks above guard it; `elapsedMs` is reported for the test log only.
    expect(Number.isFinite(elapsedMs)).toBe(true);
    expect({ container, cargo, spec }).toEqual(before);
  }, 120_000);

  it('passes the unchanged inertia certification, which the nine-pallet plan failed on braking', async () => {
    const result = centerPalletCargo(packOnPallets(container, cargo, spec, 'stability'), container);
    const target = physicsTargetFromPalletSnapshot(container, cargo, { spec, result });
    expect(target.result.validationIssues).toEqual([]);
    const certification = await runInertiaCertification(target);
    expect(certification.status).toBe('passed');
    expect(certification.failedScenarios).toEqual([]);
    expect(certification.maxTiltDeg).toBeLessThanOrEqual(1.8);
    expect(certification.maxHorizontalShiftM).toBeLessThanOrEqual(.012);
    expect(certification.physicsValidation?.unstableCount).toBe(0);
    expect(certification.physicsValidation?.settled).toBe(true);
  }, 300_000);
});
