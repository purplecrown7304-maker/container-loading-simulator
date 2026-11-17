import { afterEach, describe, expect, it } from 'vitest';
import { packOnPallets } from './palletOptimization';
import { buildPalletLoadFromDeckPlacements, defaultPalletSpec, palletTopLayerFill } from './palletPacking';
import { centerPalletCargo } from './palletCentering';
import { runInertiaAnimation } from './inertiaSimulation';
import { physicsTargetFromPalletSnapshot } from '../certifiedExport';
import { buildSecuringUsage, isInertiaStable, runInertiaCertification, securingProfileForUsage } from '../inertiaCertification';
import { isPhysicsTargetVerified } from '../inertiaWorkOrderPolicy';
import { resetPhysicsWorkerPool } from '../physicsWorkerPool';
import type { CargoItem, ContainerSpec, Placement } from './types';

// Anonymized full + partial package rows: 1,219×41 + 1×21 = 50,000 product EA.
const cargo: CargoItem[] = [{
  id: 'FULL', name: 'Full carton', length: .23500000000000001, width: .13, height: .265,
  weightKg: 1.42, quantity: 1219, unitsPerPackage: 41, maxTopLoadKg: 34.3,
  allowRotation: true, strengthUnverified: false, topLoadLimitExplicit: true,
}, {
  id: 'PARTIAL', name: 'Partial carton', length: .23500000000000001, width: .13, height: .265,
  weightKg: 1.0199999999999998, quantity: 1, unitsPerPackage: 21, maxTopLoadKg: 34.3,
  allowRotation: true, strengthUnverified: false, topLoadLimitExplicit: true,
}];
const container: ContainerSpec = {
  length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  ceilingClearanceM: .05, unloadingPolicy: 'strict', floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
  palletDestination: { region: 'europe', transport: 'domestic', requiredSize: '1100x1100' },
};
const spec = { ...defaultPalletSpec, height: .12, tareWeightKg: 6, maxLoadKg: 1000,
  maxStaticLoadKg: 1000, maxStackLevels: 2, material: 'plastic' as const };

afterEach(() => resetPhysicsWorkerPool());

describe('large pallet shipment braking without changing safety rules', () => {
  it('keeps 50,000 EA on five pallets and passes the complete existing certification at seven tiers', async () => {
    const before = structuredClone({ container, cargo, spec });
    const result = centerPalletCargo(packOnPallets(container, cargo, spec, 'stability'), container);
    expect(result.placements).toHaveLength(1220);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(5);
    expect(result.placements.filter(p => p.cargoId === 'FULL')).toHaveLength(1219);
    expect(result.placements.filter(p => p.cargoId === 'PARTIAL')).toHaveLength(1);
    expect(Math.max(...result.pallets.map(load => new Set(load.cargoPlacements.map(p => Math.round(p.z * 1e6))).size))).toBe(7);
    for (const load of result.pallets) {
      if (!load.isMixedTail) expect(palletTopLayerFill(load)).toBeGreaterThanOrEqual(.5);
      expect(load.cargoWeightKg).toBeLessThanOrEqual(spec.maxLoadKg);
    }
    const target = physicsTargetFromPalletSnapshot(container, cargo, { spec, result });
    expect(target.result.validationIssues).toEqual([]);
    expect(target.result.operationalFindings?.filter(f => f.severity === 'error')).toEqual([]);
    const certification = await runInertiaCertification(target);
    expect(certification.status).toBe('passed');
    expect(certification.failedScenarios).toEqual([]);
    expect(certification.passedScenarios).toBe(3);
    expect(certification.maxHorizontalShiftM).toBeLessThanOrEqual(.012);
    expect(certification.maxTiltDeg).toBeLessThanOrEqual(1.8);
    expect(certification.maxCargoRelativeSlipM).toBeLessThanOrEqual(.008);
    expect(certification.maxSupportShiftM).toBeLessThanOrEqual(.012);
    expect(certification.physicsValidation?.scenarios).toHaveLength(4);
    expect(certification.physicsValidation?.unstableCount).toBe(0);
    expect(certification.physicsValidation?.settled).toBe(true);
    expect(isPhysicsTargetVerified(target, certification)).toBe(true);
    expect({ container, cargo, spec }).toEqual(before);
  }, 180_000);

  it('continues to reject the original full eight-tier unit under unchanged braking limits', async () => {
    const placements: Placement[] = [];
    for (let tier = 0; tier < 8; tier += 1) for (let ix = 0; ix < 4; ix += 1) for (let iy = 0; iy < 8; iy += 1) {
      placements.push({ cargoId: 'FULL', x: .08 + ix * .235, y: .03 + iy * .13,
        z: tier * .265, length: .235, width: .13, height: .265, weightKg: 1.42 });
    }
    const load = buildPalletLoadFromDeckPlacements(1, placements, spec);
    const dx = 5, dy = .625;
    const support = { id: 'PALLET-1', x: dx, y: dy, z: 0, length: 1.1, width: 1.1, height: .12, weightKg: 6, dynamic: true };
    const target = { mode: 'pallets' as const, container, cargo, supports: [support], result: {
      placements: load.cargoPlacements.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })), remaining: [],
      loadedWeightKg: load.totalWeightKg, usedVolumeM3: placements.length * .235 * .13 * .265, validationIssues: [],
    } };
    const usage = buildSecuringUsage(target, 3);
    expect(usage.bandingStraps).toBe(4);
    const profile = securingProfileForUsage('pallets', usage);
    const result = await runInertiaAnimation(container, target.result.placements, 'braking', [support], undefined, profile,
      { captureFrames: false, captureFinalMotion: true });
    expect(result.scenarioDemandG).toBe(.5);
    expect(result.maxTiltDeg).toBeGreaterThan(1.8);
    expect(isInertiaStable(result, 'pallets')).toBe(false);
  }, 30_000);
});
