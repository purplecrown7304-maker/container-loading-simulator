import { afterEach, describe, expect, it } from 'vitest';
import { buildBlackboxSnapshots, buildConsistencyReport, buildStackAnalysis } from './diagnosticBlackbox';
import { clearPalletSnapshot, publishPalletSnapshot, type PalletSnapshot } from './palletSnapshotStore';
import { clearPhysicsTarget, publishPhysicsTarget } from './physicsTarget';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import { writeLoadingStrategyPreference } from './loadingStrategyPreference';
import { defaultPalletSpec } from './engine/palletPacking';
import { validateOperationalLoading } from './engine/operationalValidator';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';

afterEach(() => {
  clearPalletSnapshot({ preserveCertification: true });
  clearPhysicsTarget();
  writeLoadingStrategyPreference(null);
});

describe('diagnostic pallet support analysis', () => {
  it('recognizes a pallet as valid support for its first carton layer', () => {
    const cargo: CargoItem[] = [{
      id: 'A',
      name: 'A',
      length: 0.5,
      width: 0.5,
      height: 0.25,
      weightKg: 10,
      quantity: 2,
      maxStackLayers: 2,
      maxTopLoadKg: 100,
    }];
    const result: LoadingResult = {
      placements: [
        { cargoId: 'A', x: 0.1, y: 0.1, z: 0.15, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
        { cargoId: 'A', x: 0.1, y: 0.1, z: 0.4, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
      ],
      remaining: [],
      loadedWeightKg: 45,
      usedVolumeM3: 0.125,
      validationIssues: [],
    };
    const supports: PhysicsSupport[] = [{
      id: 'PALLET-01',
      x: 0,
      y: 0,
      z: 0,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      weightKg: 25,
      dynamic: true,
    }];

    const analysis = buildStackAnalysis(cargo, result, supports);

    expect(analysis[0].supportType).toBe('pallet');
    expect(analysis[0].supportRatioPct).toBeCloseTo(100);
    expect(analysis[0].centerSupported).toBe(true);
    expect(analysis[0].unsupported).toBe(false);
    expect(analysis[0].stackLevel).toBe(1);
    expect(analysis[1].supportType).toBe('cargo');
    expect(analysis[1].stackLevel).toBe(2);
    expect(analysis.every(item => !item.tippingRisk)).toBe(true);
  });

  it('still flags a floating carton when no cargo or pallet supports it', () => {
    const cargo: CargoItem[] = [{
      id: 'A',
      name: 'A',
      length: 0.5,
      width: 0.5,
      height: 0.25,
      weightKg: 10,
      quantity: 1,
    }];
    const result: LoadingResult = {
      placements: [
        { cargoId: 'A', x: 0, y: 0, z: 0.3, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
      ],
      remaining: [],
      loadedWeightKg: 10,
      usedVolumeM3: 0.0625,
      validationIssues: [],
    };

    const [analysis] = buildStackAnalysis(cargo, result, []);

    expect(analysis.supportType).toBe('unsupported');
    expect(analysis.unsupported).toBe(true);
    expect(analysis.tippingRisk).toBe(true);
  });
});


const diagnosticContainer: ContainerSpec = { length: 4, width: 2, height: 3, maxPayloadKg: 1000 };
const diagnosticItem: CargoItem = {
  id: 'BOX', name: 'Box', length: 1, width: 1, height: 0.5, weightKg: 10, quantity: 20,
  maxTopLoadKg: 100, maxStackLayers: 10,
};
const placement = (patch: Partial<Placement> = {}): Placement => ({
  cargoId: 'BOX', x: 0, y: 0, z: 0, length: 1, width: 1, height: 0.5, weightKg: 10, ...patch,
});
const loadingResult = (placements: Placement[]): LoadingResult => ({
  placements, remaining: [], loadedWeightKg: placements.reduce((sum, item) => sum + item.weightKg, 0),
  usedVolumeM3: placements.reduce((sum, item) => sum + item.length * item.width * item.height, 0), validationIssues: [],
});
const stackCheck = (cargo: CargoItem[], result: LoadingResult, container = diagnosticContainer) =>
  buildConsistencyReport(container, cargo, result).checks.find(check => check.id === 'stack-support-integrity')!;

// Only the two-box geometry is retained from the reported partial-support case.
// No product identifiers, full layout or uploaded diagnostic contents are fixtures.
describe('diagnostic support contract and conservative margins', () => {
  it('keeps the 80.769% support / 25 mm overhang case as a warning rather than a hard failure', () => {
    const result = loadingResult([
      placement({ length: .235, width: .31, height: .265 }),
      placement({ y: .205, z: .265, length: .235, width: .13, height: .265 }),
    ]);
    const analysis = buildStackAnalysis([diagnosticItem], result)[1];
    expect(analysis.supportRatioPct).toBeCloseTo(80.7692307692);
    expect(analysis.maxOverhangM).toBeCloseTo(.025);
    expect(analysis).toMatchObject({ unsupported: false, centerSupported: true, hardConstraintViolation: false, tippingRisk: true });
    expect(analysis.supportWarnings).toEqual(['LOW_SUPPORT_MARGIN', 'OVERHANG_MARGIN']);
    expect(stackCheck([diagnosticItem], result)).toMatchObject({ severity: 'WARNING', actual: [1] });
  });

  it.each([[.8, false], [.799, true]] as const)('uses the shared hard boundary at %s support', (ratio, expected) => {
    const result = loadingResult([placement({ length: ratio }), placement({ z: .5 })]);
    const analysis = buildStackAnalysis([diagnosticItem], result)[1];
    expect(analysis.unsupported).toBe(expected);
    expect(analysis.hardConstraintViolation).toBe(expected);
    expect(stackCheck([diagnosticItem], result).severity).toBe(expected ? 'CRITICAL' : 'WARNING');
  });

  it.each([[.0008, false], [.0014, true]] as const)('uses the shared legacy contact tolerance for a %s m gap', (gap, expected) => {
    const result = loadingResult([placement(), placement({ z: .5 + gap })]);
    expect(buildStackAnalysis([diagnosticItem], result)[1].hardConstraintViolation).toBe(expected);
  });

  it('uses the shared floor contact tolerance', () => {
    expect(buildStackAnalysis([diagnosticItem], loadingResult([placement({ z: .0008 })]))[0]).toMatchObject({
      supportType: 'floor', supportRatioPct: 100, centerSupported: true, hardConstraintViolation: false,
    });
  });

  it('keeps a bridge with an envelope-supported center as a conservative warning', () => {
    const result = loadingResult([
      placement({ length: .4 }), placement({ x: .6, length: .4 }), placement({ z: .5 }),
    ]);
    const analysis = buildStackAnalysis([diagnosticItem], result)[2];
    expect(analysis).toMatchObject({ supportRatioPct: 80, centerSupported: true, centerDirectlySupported: false, hardConstraintViolation: false });
    expect(analysis.supportWarnings).toContain('CENTER_NOT_DIRECTLY_SUPPORTED');
    expect(stackCheck([diagnosticItem], result).severity).toBe('WARNING');
  });

  it('retains unsupported-center and floating failures as critical', () => {
    for (const result of [
      loadingResult([placement({ length: .4 }), placement({ z: .5 })]),
      loadingResult([placement({ z: .5 })]),
    ]) {
      expect(buildStackAnalysis([diagnosticItem], result).at(-1)?.centerSupported).toBe(false);
      expect(stackCheck([diagnosticItem], result).severity).toBe('CRITICAL');
    }
  });

  it('does not let WHAT-IF support thresholds erase the baseline failure', () => {
    const container = { ...diagnosticContainer, limitReview: { mode: 'what-if' as const, minimumSupportRatio: .7 } };
    const result = loadingResult([placement({ length: .75 }), placement({ z: .5 })]);
    expect(buildStackAnalysis([diagnosticItem], result, [], container)[1].hardConstraintViolation).toBe(true);
    expect(stackCheck([diagnosticItem], result, container).severity).toBe('CRITICAL');
  });
});

describe('diagnostic cumulative top-load contract', () => {
  it('charges each bridge supporter the full descendant weight', () => {
    const cargo = [{ ...diagnosticItem, maxTopLoadKg: 60 }];
    const result = loadingResult([
      placement({ length: .5 }), placement({ x: .5, length: .5 }), placement({ z: .5, weightKg: 100 }),
    ]);
    const analysis = buildStackAnalysis(cargo, result);
    expect(analysis.map(item => item.upperLoadKg)).toEqual([100, 100, 0]);
    expect(analysis.slice(0, 2).every(item => item.topLoadExceeded && item.hardConstraintViolation)).toBe(true);
    expect(stackCheck(cargo, result)).toMatchObject({ severity: 'CRITICAL', actual: [0, 1] });
  });

  it('counts a shared descendant only once per supporting box', () => {
    const result = loadingResult([
      placement(), placement({ z: .5, length: .5 }), placement({ x: .5, z: .5, length: .5 }), placement({ z: 1 }),
    ]);
    expect(buildStackAnalysis([diagnosticItem], result).map(item => item.upperLoadKg)).toEqual([30, 10, 10, 0]);
  });

  it('does not charge unrelated elevated projections without a contact chain', () => {
    const result = loadingResult([placement(), placement({ z: 1 })]);
    expect(buildStackAnalysis([diagnosticItem], result)[0].upperLoadKg).toBe(0);
    expect(buildStackAnalysis([diagnosticItem], result)[1].hardConstraintViolation).toBe(true);
  });

  it.each([{ maxTopLoadKg: 0 }, { strengthUnverified: true }])('enforces zero/unverified top load: %j', patch => {
    const result = loadingResult([placement(), placement({ z: .5 })]);
    const analysis = buildStackAnalysis([{ ...diagnosticItem, ...patch }], result)[0];
    expect(analysis).toMatchObject({ maxTopLoadKg: 0, upperLoadKg: 10, topLoadUtilizationPct: null, topLoadExceeded: true, hardConstraintViolation: true });
  });

  it('includes a stacked pallet deck and its cargo through legacy contact links', () => {
    const result = loadingResult([placement(), placement({ z: .65 })]);
    const supports: PhysicsSupport[] = [{ id: 'DECK', x: 0, y: 0, z: .5, length: 1, width: 1, height: .15, weightKg: 25 }];
    const cargo = [{ ...diagnosticItem, maxTopLoadKg: 30 }];
    expect(buildStackAnalysis(cargo, result, supports)[0].upperLoadKg).toBe(35);
    expect(validateOperationalLoading(diagnosticContainer, cargo, result.placements, supports)
      .find(finding => finding.code === 'TOP_LOAD_EXCEEDED')).toMatchObject({ value: 35, placementIndexes: [0] });
  });
});

describe('diagnostic A-rules remain independent', () => {
  const aContainer: ContainerSpec = {
    ...diagnosticContainer,
    rules: { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], source: 'test', config: { minSupportRatio: .9, heightTolerance: 5 } },
  };

  it('uses current A support configuration, not the legacy default', () => {
    const cargo = [diagnosticItem, { ...diagnosticItem, id: 'BASE', length: .85 }];
    const result = loadingResult([placement({ cargoId: 'BASE', length: .85 }), placement({ z: .5 })]);
    expect(buildStackAnalysis(cargo, result, [], diagnosticContainer)[1].hardConstraintViolation).toBe(false);
    expect(buildStackAnalysis(cargo, result, [], aContainer)[1]).toMatchObject({
      supportRuleset: 'a-v1', minimumSupportRatioPct: 90, contactToleranceM: .005, hardConstraintViolation: true,
    });
    expect(stackCheck(cargo, result, aContainer).severity).toBe('CRITICAL');
  });

  it('uses A contact tolerance rather than the shared legacy contact tolerance', () => {
    const result = loadingResult([placement(), placement({ z: .503 })]);
    expect(buildStackAnalysis([diagnosticItem], result, [], aContainer)[1].hardConstraintViolation).toBe(false);
    expect(buildStackAnalysis([diagnosticItem], result, [], diagnosticContainer)[1].hardConstraintViolation).toBe(true);
  });

  it('uses the A cargo CG offset instead of the geometric center', () => {
    const cargo = [{ ...diagnosticItem, cgOffsetMm: { l: 600, w: 0, h: 0 } }];
    const result = loadingResult([placement(), placement({ z: .5 })]);
    expect(buildStackAnalysis(cargo, result, [], aContainer)[1]).toMatchObject({ centerSupported: false, hardConstraintViolation: true });
  });

  it('preserves the conservative retained cargo top-load audit for A', () => {
    const result = loadingResult([placement({ cargoId: 'BASE', length: .5 }), placement({ cargoId: 'BASE', x: .5, length: .5 }), placement({ z: .5, weightKg: 100 })]);
    const cargo = [{ ...diagnosticItem, id: 'BASE', length: .5, maxTopLoadKg: 60 }, { ...diagnosticItem, weightKg: 100 }];
    expect(buildStackAnalysis(cargo, result, [], aContainer).map(item => item.upperLoadKg)).toEqual([100, 100, 0]);
  });
});


function singlePalletSnapshot(): PalletSnapshot {
  const placements = [placement({ z: .15 })];
  return {
    spec: { ...defaultPalletSpec, maxStackLevels: 3, maxLoadKg: 750, useWrapping: true, minTopLayerFillRatio: .6 },
    result: {
      placements, remaining: [], palletCount: 1, loadedCargoWeightKg: 10, totalPackagingWeightKg: 0,
      avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 35,
      consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
      pallets: [{
        palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1,
        length: 1.1, width: 1.1, height: .15, cargoPlacements: placements, cargoWeightKg: 10,
        packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
        totalWeightKg: 35, centerOfGravity: { x: .5, y: .5, z: .2 },
      }],
      optimization: { strategy: 'capacity', selectedStackTarget: 2, candidateCount: 3, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 1 },
    },
  };
}

describe('diagnostic pallet replay inputs', () => {
  it('exports the matching pallet specification and run strategy separately from a later preference', () => {
    const snapshot = singlePalletSnapshot();
    const target = physicsTargetFromPalletSnapshot(diagnosticContainer, [diagnosticItem], snapshot);
    publishPalletSnapshot(snapshot, { preserveCertification: true });
    publishPhysicsTarget(target);
    writeLoadingStrategyPreference('unloading');
    const input = buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], target.result).loadingInput;
    expect(input.palletPlanningStatus).toBe('matched-current-target');
    expect(input.palletPlanning).toEqual({ spec: snapshot.spec, strategy: 'capacity', optimization: snapshot.result.optimization });
    expect(input.strategyPreferenceAtExport).toBe('unloading');
  });

  it('does not substitute the current preference when the original run strategy is unknown', () => {
    const snapshot = singlePalletSnapshot();
    delete snapshot.result.optimization.strategy;
    const target = physicsTargetFromPalletSnapshot(diagnosticContainer, [diagnosticItem], snapshot);
    publishPalletSnapshot(snapshot, { preserveCertification: true });
    publishPhysicsTarget(target);
    writeLoadingStrategyPreference('unloading');
    expect(buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], target.result).loadingInput.palletPlanning?.strategy).toBeNull();
  });

  it('does not attach an unrelated older pallet snapshot to a new result', () => {
    const snapshot = singlePalletSnapshot();
    const target = physicsTargetFromPalletSnapshot(diagnosticContainer, [diagnosticItem], snapshot);
    publishPalletSnapshot(snapshot, { preserveCertification: true });
    const moved = { ...target, result: { ...target.result, placements: target.result.placements.map(item => ({ ...item, x: .01 })) } };
    publishPhysicsTarget(moved);
    const input = buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], moved.result).loadingInput;
    expect(input).toMatchObject({ palletPlanningStatus: 'stale-snapshot', palletPlanning: null });
  });

  it('marks missing pallet settings without inventing a replayable specification', () => {
    const target = physicsTargetFromPalletSnapshot(diagnosticContainer, [diagnosticItem], singlePalletSnapshot());
    publishPhysicsTarget(target);
    expect(buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], target.result).loadingInput)
      .toMatchObject({ palletPlanningStatus: 'missing-snapshot', palletPlanning: null });
  });

  it('does not reuse a pallet snapshot for a box result or stale physics target', () => {
    const snapshot = singlePalletSnapshot();
    const target = physicsTargetFromPalletSnapshot(diagnosticContainer, [diagnosticItem], snapshot);
    publishPalletSnapshot(snapshot, { preserveCertification: true });
    publishPhysicsTarget(target);
    const differentResult = loadingResult([placement()]);
    expect(buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], differentResult).loadingInput)
      .toMatchObject({ palletPlanningStatus: 'stale-target', palletPlanning: null });
    publishPhysicsTarget({ mode: 'boxes', container: diagnosticContainer, cargo: [diagnosticItem], result: differentResult });
    expect(buildBlackboxSnapshots(diagnosticContainer, [diagnosticItem], differentResult).loadingInput)
      .toMatchObject({ palletPlanningStatus: 'not-applicable', palletPlanning: null });
  });
});
