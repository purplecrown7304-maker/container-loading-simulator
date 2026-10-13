import { afterEach, describe, expect, it } from 'vitest';
import { buildInertiaSimulationSupports, buildSecuringUsage, createPhysicsTargetSignature, securingProfileForUsage } from './inertiaCertification';
import { boxSecuringRequirements } from './engine/securingBudget';
import { defaultSecuringMaterialSettings, writeSecuringMaterialSettings } from './securingMaterialSettings';
import { gapSecuringPlan } from './engine/gapSecuring';
import type { PhysicsTarget } from './physicsTarget';

function target(mode: 'boxes' | 'pallets', width = 2.35): PhysicsTarget {
  const supportHeight = mode === 'pallets' ? .15 : 0;
  return {
    mode, container: { length: 4, width, height: 2, maxPayloadKg: 2000 },
    cargo: [{ id: 'A', name: 'A', length: .6, width: .4, height: .5, weightKg: 20, quantity: 1 }],
    result: {
      placements: [{ cargoId: 'A', x: 0, y: 0, z: supportHeight, length: .6, width: .4, height: .5, weightKg: 20 }],
      remaining: [], loadedWeightKg: 20 + (supportHeight ? 25 : 0), usedVolumeM3: .12, validationIssues: [],
    },
    supports: supportHeight ? [{ id: 'P1', x: 0, y: 0, z: 0, length: 1.1, width: 1.1, height: supportHeight, weightKg: 25, dynamic: true }] : [],
  };
}

afterEach(() => localStorage.clear());

describe('unverified generic load bars cannot supply virtual restraint', () => {
  it.each(['boxes', 'pallets'] as const)('keeps %s material counts and profiles free of invented bars at every level', mode => {
    const current = target(mode);
    for (const level of [1, 2, 3] as const) {
      const usage = buildSecuringUsage(current, level);
      expect(usage.loadBars).toBe(0);
      const profile = securingProfileForUsage(mode, usage);
      expect(profile.supportRestraint).toBeUndefined();
      // Old saved generic quantities must not regain force, stiffness or damping.
      expect(securingProfileForUsage(mode, { ...usage, loadBars: 200 })).toEqual(profile);
      expect(profile.frictionCoefficient).toBeGreaterThan(.62);
      expect(profile.cargoRestraint?.maxAccelerationG).toBeGreaterThan(0);
      if (mode === 'pallets') {
        expect(usage.bandingStraps).toBeGreaterThan(0);
        expect(usage.wrappingLengthM).toBeGreaterThan(0);
      } else expect(usage.dunnageBlocks).toBeGreaterThan(0);
    }
  });

  it('does not reserve uninstalled generic-bar mass, but still budgets other materials', () => {
    for (const level of [1, 2, 3] as const) {
      const baseline = boxSecuringRequirements(74, level, defaultSecuringMaterialSettings);
      expect(baseline.loadBars).toBe(0);
      expect(boxSecuringRequirements(74, level, { ...defaultSecuringMaterialSettings, loadBarKgPerEa: 100_000 })).toEqual(baseline);
      expect(baseline.weightKg).toBeCloseTo(baseline.antiSlipMats * defaultSecuringMaterialSettings.antiSlipKgPerEa
        + baseline.dunnageBlocks * defaultSecuringMaterialSettings.dunnageKgPerEa);
    }
  });

  it('preserves an actually configured door-bar support independently from the generic catalog entry', () => {
    const fits = target('boxes');
    const fitUsage = buildSecuringUsage(fits, 3);
    expect(fitUsage.loadBars).toBe(0);
    expect(buildInertiaSimulationSupports(fits, fitUsage).some(s => s.id === 'fill-door-face')).toBe(true);
    const tooNarrow = target('boxes', 1.67);
    const noFitUsage = buildSecuringUsage(tooNarrow, 3);
    expect(buildInertiaSimulationSupports(tooNarrow, noFitUsage).some(s => s.id === 'fill-door-face')).toBe(false);
    expect(gapSecuringPlan(tooNarrow.container, tooNarrow.result.placements).fills.find(f => f.kind === 'door-face')?.material).toBe('unresolved');

    // An explicit user material range may make a door bar eligible; never infer it from mass.
    writeSecuringMaterialSettings({ ...defaultSecuringMaterialSettings, voidDoorBarMinSpanM: 1.5, voidDoorBarMaxSpanM: 1.8 });
    const configured = buildSecuringUsage(tooNarrow, 3);
    expect(configured.loadBars).toBe(0);
    expect(buildInertiaSimulationSupports(tooNarrow, configured).some(s => s.id === 'fill-door-face')).toBe(true);
    expect(securingProfileForUsage('boxes', configured)).toEqual(securingProfileForUsage('boxes', noFitUsage));
  });

  it('invalidates old model evidence and changed orientation permissions without depending on list order', () => {
    const current = target('boxes');
    const original = createPhysicsTargetSignature(current);
    expect(JSON.parse(original).physicsModel).toBe('restraint-v7-stepped-door-faces');
    const restricted = { ...current, cargo: current.cargo.map(c => ({ ...c, allowedOrientations: ['WLH'] as const })) };
    expect(createPhysicsTargetSignature(restricted as unknown as PhysicsTarget)).not.toBe(original);
    expect(createPhysicsTargetSignature({ ...current, cargo: current.cargo.map(c => ({ ...c, thisSideUp: true })) })).not.toBe(original);
    const normalFirst = { ...current, cargo: current.cargo.map(c => ({ ...c, allowedOrientations: ['LWH', 'WLH'] as const })) };
    const rotatedFirst = { ...current, cargo: current.cargo.map(c => ({ ...c, allowedOrientations: ['WLH', 'LWH'] as const })) };
    expect(createPhysicsTargetSignature(normalFirst as unknown as PhysicsTarget)).toBe(createPhysicsTargetSignature(rotatedFirst as unknown as PhysicsTarget));
  });
});
