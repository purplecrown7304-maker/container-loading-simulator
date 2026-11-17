import { afterEach, describe, expect, it } from 'vitest';
import { buildPalletLoadFromDeckPlacements } from './engine/palletPacking';
import { defaultPalletSpec, type OptimizedPalletPackingResult } from './engine/palletOptimization';
import type { MixedModePackingResult } from './engine/mixedModePacking';
import type { PalletSnapshot } from './palletSnapshotStore';
import { STAGING_PALLET_PLAN_EVENT, publishStagingPalletPlan, sameStagingPalletSpec, stagingPalletSceneData, stagingPalletsWithBanding,
  type StagingPalletPlanDetail } from './stagingPalletBridge';
import { buildSecuringUsage, createPhysicsTargetSignature } from './inertiaCertification';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import { validSavedStagingPallet } from './stagingPersistence';
import { viewerPlan } from './viewerSceneProtocol';
import { inertiaHostMatchesTarget } from './inertiaCanvasStore';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 };
const cargo = [{ id: 'A', name: '원본 제품', length: .5, width: .5, height: .3, weightKg: 10, quantity: 2 }];
function fixture(): PalletSnapshot {
  const spec = { ...defaultPalletSpec, material: 'plastic' as const };
  const pallet = buildPalletLoadFromDeckPlacements(3, [
    { cargoId: 'A', unitId: 'A-1', x: .3, y: .3, z: 0, length: .5, width: .5, height: .3, weightKg: 10 },
  ], spec);
  const result: OptimizedPalletPackingResult = { pallets: [pallet], placements: pallet.cargoPlacements,
    remaining: [{ cargoId: 'A', quantity: 1, reason: '대기' }], palletCount: 1,
    loadedCargoWeightKg: 10, totalPackagingWeightKg: pallet.packagingWeightKg, avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0, totalPalletizedWeightKg: pallet.totalWeightKg, consolidatedPallets: 0,
    lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
    optimization: { selectedStackTarget: 1, candidateCount: 1, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 } };
  return { spec, result };
}
const listeners: EventListener[] = [];
afterEach(() => { listeners.forEach(listener => window.removeEventListener(STAGING_PALLET_PLAN_EVENT, listener)); listeners.length = 0; });

describe('staging pallet scene bridge', () => {
  it('keeps real base wrapping and corner guards in the vehicle before any transport certificate', () => {
    const snapshot = fixture();
    snapshot.spec = { ...snapshot.spec, useWrapping: true, useCornerGuards: true, minimizePackaging: false };
    const load = buildPalletLoadFromDeckPlacements(3, [{ ...snapshot.result.pallets[0].cargoPlacements[0], z: 0 }], snapshot.spec);
    Object.assign(snapshot.result, { pallets: [load], placements: load.cargoPlacements, totalPalletizedWeightKg: load.totalWeightKg });
    const before = JSON.stringify(snapshot), scene = stagingPalletSceneData(container, cargo, snapshot);
    expect(scene.supports[0].visualPackaging).toEqual({ wrapping: true, cornerGuards: true, bandingStraps: 0 });
    const plan = viewerPlan(container, scene.result, 1, cargo, { supports: scene.supports, securing: null });
    expect(plan.decorations.filter(item => item.wrapping)).toHaveLength(1);
    expect(plan.decorations.filter(item => item.modelKey === 'corner-guard')).toHaveLength(4);
    expect(plan.decorations.filter(item => item.color === '#1f2937')).toHaveLength(0);
    expect(scene.result.loadedWeightKg).toBe(load.totalWeightKg); expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('retains captured actual reinforcement flags without altering target signatures or inertia host matching', () => {
    const snapshot = fixture(), target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
    const certified = { mode: 'pallets' as const, targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, 3) };
    const pallets = stagingPalletsWithBanding(container, cargo, snapshot, certified);
    const scene = stagingPalletSceneData(container, cargo, { ...snapshot, result: { ...snapshot.result, pallets } });
    expect(scene.supports[0].visualPackaging).toEqual({ wrapping: true, cornerGuards: true, bandingStraps: 4 });
    const visualTarget = { ...target, supports: target.supports!.map((support, index) => ({ ...support, visualPackaging: scene.supports[index].visualPackaging })) };
    expect(createPhysicsTargetSignature(visualTarget)).toBe(createPhysicsTargetSignature(target));
    const host = { element: document.createElement('div'), container, result: scene.result, supports: scene.supports };
    expect(inertiaHostMatchesTarget(host, target)).toBe(true);
    expect(inertiaHostMatchesTarget({ ...host, supports: [{ ...host.supports[0], weightKg: host.supports[0].weightKg + 1 }] }, target)).toBe(false);
    expect(createPhysicsTargetSignature({ ...visualTarget, supports: [{ ...visualTarget.supports[0], weightKg: visualTarget.supports[0].weightKg + 1 }] })).not.toBe(createPhysicsTargetSignature(target));
  });

  it.each([0, 1, 2, 3] as const)('retains only the actual matching level %i banding plan without changing material mass or geometry', level => {
    const snapshot = fixture(), before = JSON.stringify(snapshot), target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
    const certificate = { mode: 'pallets' as const, targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, level) };
    const loads = stagingPalletsWithBanding(container, cargo, snapshot, certificate);
    expect(loads[0].bandingPlan).toEqual({ straps: [0, 2, 3, 4][level], securingLevel: level, wrapping: level >= 2, cornerGuards: level > 0 });
    expect(loads[0].totalWeightKg).toBe(snapshot.result.pallets[0].totalWeightKg);
    expect(loads[0].cargoPlacements).toBe(snapshot.result.pallets[0].cargoPlacements);
    expect(validSavedStagingPallet(JSON.parse(JSON.stringify(loads[0])))).toBe(true);
    expect(validSavedStagingPallet({ ...loads[0], bandingPlan: { straps: 100000, securingLevel: 3 } })).toBe(false);
    expect(stagingPalletsWithBanding(container, cargo, snapshot)).toBe(snapshot.result.pallets);
    expect(stagingPalletsWithBanding(container, cargo, snapshot, { ...certificate, targetSignature: 'stale' })).toBe(snapshot.result.pallets);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('keeps the canonical pallet support, model, gross weight and advisory arithmetic', () => {
    const snapshot = fixture(); const scene = stagingPalletSceneData(container, cargo, snapshot);
    expect(scene.supports).toHaveLength(1);
    expect(scene.supports[0]).toMatchObject({ id: 'PALLET-3', modelKey: 'plastic-pallet',
      height: snapshot.spec.height, weightKg: snapshot.spec.tareWeightKg });
    expect(scene.result.placements).toBe(snapshot.result.placements);
    expect(scene.result.remaining).toBe(snapshot.result.remaining);
    expect(scene.result.loadedWeightKg).toBe(snapshot.result.totalPalletizedWeightKg);
    expect(scene.result.usedVolumeM3).toBeCloseTo(.075);
    expect(scene.result.operationalFindings?.some(f => f.code === 'PALLET_DECK_COVERAGE')).toBe(true);
    expect(scene.supports[0].unitCenterOfGravity).toBe(snapshot.result.pallets[0].centerOfGravity);
    expect(scene.supports[0].unitHeightM).toBeCloseTo(.45);
  });
  it('uses mixed total weight once and includes the direct boxes without extra supports', () => {
    const snapshot = fixture();
    const direct = { ...snapshot.result.placements[0], unitId: 'A-2', x: 2, z: 0 };
    snapshot.result = { ...snapshot.result, placements: [...snapshot.result.placements, direct],
      mixed: { enabled: true, directBoxCount: 1, directFloorBoxCount: 1, palletBoxCount: 1, palletCount: 1,
        demotedPalletCount: 0, candidateCount: 1, minPalletFillRatio: .7, palletFillRates: [],
        totalLoadedWeightKg: snapshot.result.totalPalletizedWeightKg + 10 } } as MixedModePackingResult;
    const scene = stagingPalletSceneData(container, cargo, snapshot);
    expect(scene.supports).toHaveLength(1);
    expect(scene.result.loadedWeightKg).toBe(snapshot.result.totalPalletizedWeightKg + 10);
    expect(scene.result.placements).toHaveLength(2);
  });
  it('is pure and preserves an explicitly established manual securing budget', () => {
    const snapshot = fixture(); const before = JSON.stringify(snapshot);
    stagingPalletSceneData(container, cargo, snapshot); expect(JSON.stringify(snapshot)).toBe(before);
    const securingBudget = { level: 3 as const, reservedWeightKg: 12, requiredWeightKg: 11, totalTransportWeightKg: 46 };
    Object.assign(snapshot.result, { securingBudget });
    expect(stagingPalletSceneData(container, cargo, snapshot).result.securingBudget).toBe(securingBudget);
  });
  it('needs an explicit owner acknowledgement and creates no snapshot/storage state', () => {
    const snapshot = fixture(); const storage = JSON.stringify(localStorage);
    expect(publishStagingPalletPlan('current', snapshot)).toBe(false);
    const listener: EventListener = event => {
      const detail = (event as CustomEvent<StagingPalletPlanDetail>).detail;
      if (detail.inputKey === 'current' && detail.snapshot === snapshot) detail.accepted = true;
    };
    window.addEventListener(STAGING_PALLET_PLAN_EVENT, listener); listeners.push(listener);
    expect(publishStagingPalletPlan('old', snapshot)).toBe(false);
    expect(publishStagingPalletPlan('current', snapshot)).toBe(true);
    expect(JSON.stringify(localStorage)).toBe(storage);
  });
  it('matches specifications independently of property insertion order and rejects changed limits', () => {
    const a = fixture().spec;
    const b = Object.fromEntries(Object.entries(a).reverse()) as typeof a;
    expect(sameStagingPalletSpec(a, b)).toBe(true);
    expect(sameStagingPalletSpec(a, { ...b, maxLoadKg: b.maxLoadKg - 1 })).toBe(false);
  });
});
