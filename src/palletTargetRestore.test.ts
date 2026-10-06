import { afterEach, describe, expect, it } from 'vitest';
import { defaultPalletSpec, type OptimizedPalletPackingResult, type PalletLoad } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import { clearPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';
import { buildPalletPhysicsTarget, restorePalletPhysicsTarget } from './palletTargetRestore';
import { clearPhysicsTarget, publishPhysicsTarget, readPhysicsTarget } from './physicsTarget';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { isPhysicsTargetVerified } from './inertiaWorkOrderPolicy';
import { viewerPlan } from './viewerSceneProtocol';
import { choosePalletType } from './palletTypeSelection';

const container: ContainerSpec = {
  length: 5,
  width: 2.4,
  height: 2.4,
  maxPayloadKg: 5000,
};

const cargo: CargoItem[] = [{
  id: 'BOX-A',
  name: '테스트 박스',
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
  quantity: 1,
  maxStackLayers: 4,
  maxTopLoadKg: 100,
  allowRotation: true,
}];

const placement: Placement = {
  cargoId: 'BOX-A',
  x: 0,
  y: 0,
  z: defaultPalletSpec.height,
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
};

const pallet: PalletLoad = {
  palletIndex: 1,
  x: 0,
  y: 0,
  z: 0,
  stackLevel: 1,
  stackColumn: 1,
  length: defaultPalletSpec.length,
  width: defaultPalletSpec.width,
  height: defaultPalletSpec.height,
  cargoPlacements: [placement],
  cargoWeightKg: 10,
  packagingWeightKg: 0,
  packagingExtraHeightM: 0,
  cornerGuardsUsed: false,
  wrappingUsed: false,
  totalWeightKg: 10 + defaultPalletSpec.tareWeightKg,
  centerOfGravity: { x: 0.25, y: 0.2, z: defaultPalletSpec.height + 0.15 },
};

const result: OptimizedPalletPackingResult = {
  pallets: [pallet],
  placements: [placement],
  remaining: [],
  palletCount: 1,
  loadedCargoWeightKg: 10,
  totalPackagingWeightKg: 0,
  avoidedPackagingWeightKg: 0,
  packagedPalletCount: 0,
  totalPalletizedWeightKg: pallet.totalWeightKg,
  consolidatedPallets: 0,
  lateralImbalanceKg: 0,
  stackedPallets: 0,
  maxUsedStackLevel: 1,
  optimization: {
    selectedStackTarget: 1,
    candidateCount: 1,
    floorPositions: 1,
    redistributedForLowUtilization: false,
    consolidationPasses: 0,
  },
};

afterEach(() => {
  clearPalletSnapshot({ preserveCertification: true });
  clearPhysicsTarget();
});

describe('pallet target restoration', () => {
  it('keeps the saved plastic skin through restoration and Unity serialization even after selection changes', () => {
    publishPalletSnapshot({ spec: { ...defaultPalletSpec, material: 'plastic' }, result }, { preserveCertification: true, emitLegacyEvent: false });
    choosePalletType('t11-wood');
    const target = buildPalletPhysicsTarget(container, cargo)!;
    const plan = viewerPlan(container, target.result, 1, cargo, { supports: target.supports });
    expect(plan.supports[0]).toMatchObject({ modelKey: 'plastic-pallet', length: pallet.length, width: pallet.width, height: pallet.height, weightKg: defaultPalletSpec.tareWeightKg });
    expect(plan.placements[0]).toMatchObject(placement);
    choosePalletType('auto');
  });
  it('rebuilds the same pallet result and support geometry from the persisted snapshot', () => {
    publishPalletSnapshot({ spec: defaultPalletSpec, result }, { preserveCertification: true, emitLegacyEvent: false });
    const target = buildPalletPhysicsTarget(container, cargo);

    expect(target?.mode).toBe('pallets');
    expect(target?.result.placements).toEqual([placement]);
    expect(target?.result.loadedWeightKg).toBe(pallet.totalWeightKg);
    expect(target?.supports).toHaveLength(1);
    expect(target?.supports?.[0]).toMatchObject({
      id: 'PALLET-01',
      modelKey: 'wood-pallet',
      x: 0,
      y: 0,
      z: 0,
      length: defaultPalletSpec.length,
      width: defaultPalletSpec.width,
      height: defaultPalletSpec.height,
      dynamic: true,
    });
  });

  it('publishes the restored target so result and work-order actions can reuse it', () => {
    publishPalletSnapshot({ spec: defaultPalletSpec, result }, { preserveCertification: true, emitLegacyEvent: false });
    expect(readPhysicsTarget()).toBeUndefined();

    const restored = restorePalletPhysicsTarget(container, cargo);

    expect(restored?.mode).toBe('pallets');
    expect(readPhysicsTarget()).toEqual(restored);
  });

  it('retains static errors during restoration even when identical coordinates carry an old PASS', () => {
    publishPalletSnapshot({spec:defaultPalletSpec,result},{preserveCertification:true,emitLegacyEvent:false});
    const rebuilt = buildPalletPhysicsTarget(container,cargo)!;
    const unchecked = {...rebuilt,result:{...rebuilt.result,validationIssues:[],operationalFindings:[]}};
    const certification: InertiaCertification = {
      status:'passed',mode:'pallets',targetSignature:createPhysicsTargetSignature(unchecked),testedAt:'2026-10-06T00:00:00Z',
      securing:buildSecuringUsage(unchecked,1),testedScenarios:3,passedScenarios:3,failedScenarios:[],payloadWithinLimit:true,
      maxHorizontalShiftM:0,maxTiltDeg:0,maxCargoRelativeSlipM:0,maxSupportShiftM:0,
      results:Object.fromEntries((['acceleration','braking','cornering'] as const).map(scenario=>[scenario,{
        scenario,fps:30,simulatedSeconds:4,cargoCount:1,supportCount:1,frames:[],maxHorizontalShiftM:0,maxTiltDeg:0,
        maxCargoRelativeSlipM:0,maxSupportShiftM:0,
      }])),
    };
    expect(isPhysicsTargetVerified(unchecked,certification)).toBe(true);
    publishPhysicsTarget(unchecked);
    const restored = restorePalletPhysicsTarget(container,cargo)!;
    expect(createPhysicsTargetSignature(restored)).toBe(certification.targetSignature);
    expect(restored.result.operationalFindings?.some(f=>f.code==='CG_LONGITUDINAL' && f.severity==='error')).toBe(true);
    expect(isPhysicsTargetVerified(restored,certification)).toBe(false);
    expect(readPhysicsTarget()).toEqual(restored);
  });

  it('rechecks live-only pallet targets when no saved snapshot exists', () => {
    const live = {mode:'pallets' as const,container,cargo,result:{
      placements:[placement],remaining:[],loadedWeightKg:10,usedVolumeM3:.06,validationIssues:[],
    }};
    publishPhysicsTarget(live);
    const restored = restorePalletPhysicsTarget(container,cargo)!;
    expect(restored.result.operationalFindings?.some(f=>f.code==='FLOATING')).toBe(true);
  });

  it('preserves the A ruleset marker used by the original target signature', () => {
    const space: ContainerSpec = {...container,rules:{version:'a-v1',equipmentId:'restore-test',kind:'container',access:['rear'],source:'test'}};
    publishPalletSnapshot({spec:defaultPalletSpec,result},{preserveCertification:true,emitLegacyEvent:false});
    const restored = buildPalletPhysicsTarget(space,cargo)!;
    expect(restored.result.ruleset).toBe('a-v1');
    const original = {...restored,result:{...restored.result,ruleset:'a-v1' as const}};
    expect(createPhysicsTargetSignature(restored)).toBe(createPhysicsTargetSignature(original));
  });
});
